use std::collections::HashMap;
use std::process::Command;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

use bytes::{Buf, BufMut};
use dashmap::DashMap;
use http::uri::PathAndQuery;
use http::Uri;
use prost::Message;
use prost_reflect::{DeserializeOptions, DescriptorPool, DynamicMessage, MessageDescriptor, SerializeOptions};
use prost_types::FileDescriptorSet;
use sha2::{Digest, Sha256};
use tonic::client::Grpc;
use tonic::codec::{Codec, DecodeBuf, Decoder, EncodeBuf, Encoder};
use tonic::metadata::{KeyAndValueRef, MetadataMap};
use tonic::transport::{Channel, Endpoint};
use tonic::{Request, Status};

use crate::helpers::auth::apply_auth_to_headers;
use crate::types::{AuthType, GrpcCallRequest, GrpcCallResponse, SizeInfo, TimingInfo};

static DESCRIPTOR_CACHE: OnceLock<DashMap<String, Arc<DescriptorPool>>> = OnceLock::new();

fn descriptor_cache() -> &'static DashMap<String, Arc<DescriptorPool>> {
    DESCRIPTOR_CACHE.get_or_init(DashMap::new)
}

fn proto_hash(proto: &str) -> String {
    format!("{:x}", Sha256::digest(proto.as_bytes()))
}

fn compile_descriptor_pool(proto: &str) -> Result<Arc<DescriptorPool>, String> {
    let hash = proto_hash(proto);
    if let Some(cached) = descriptor_cache().get(&hash) {
        return Ok(cached.clone());
    }

    let temp_dir = std::env::temp_dir().join(format!("mandy-grpc-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("Temp dir error: {e}"))?;

    let proto_path = temp_dir.join("request.proto");
    std::fs::write(&proto_path, proto).map_err(|e| format!("Write proto error: {e}"))?;

    let descriptor_path = temp_dir.join("descriptor.pb");
    let protoc = protoc_bin_vendored::protoc_bin_path()
        .map_err(|e| format!("protoc binary unavailable: {e}"))?;

    let output = Command::new(&protoc)
        .current_dir(&temp_dir)
        .arg("--descriptor_set_out=descriptor.pb")
        .arg("--include_imports")
        .arg("--proto_path=.")
        .arg("request.proto")
        .output()
        .map_err(|e| format!("Failed to run protoc: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr.trim();
        return Err(if detail.is_empty() {
            "protoc failed to compile proto definition".to_string()
        } else {
            format!("protoc failed: {detail}")
        });
    }

    let bytes =
        std::fs::read(&descriptor_path).map_err(|e| format!("Read descriptor error: {e}"))?;
    let set = FileDescriptorSet::decode(bytes.as_slice())
        .map_err(|e| format!("Decode descriptor set error: {e}"))?;
    let pool = DescriptorPool::from_file_descriptor_set(set)
        .map_err(|e| format!("Descriptor pool error: {e}"))?;

    let pool = Arc::new(pool);
    descriptor_cache().insert(hash, pool.clone());
    let _ = std::fs::remove_dir_all(&temp_dir);
    Ok(pool)
}

fn find_method(
    pool: &DescriptorPool,
    service_name: &str,
    method_name: &str,
) -> Result<(MessageDescriptor, MessageDescriptor, String), String> {
    let service_name = service_name.trim();
    let method_name = method_name.trim();
    if service_name.is_empty() || method_name.is_empty() {
        return Err("Service and method are required".to_string());
    }

    for service in pool.services() {
        let full = service.full_name();
        if full == service_name
            || full.ends_with(&format!(".{service_name}"))
            || service.name() == service_name
        {
            for method in service.methods() {
                if method.name() == method_name {
                    let path = format!("/{}/{}", full, method_name);
                    return Ok((
                        method.input().clone(),
                        method.output().clone(),
                        path,
                    ));
                }
            }
        }
    }

    Err(format!(
        "Method '{method_name}' not found on service '{service_name}'"
    ))
}

fn json_to_dynamic(input: MessageDescriptor, json: &str) -> Result<DynamicMessage, String> {
    let mut de = serde_json::Deserializer::from_str(json);
    let options = DeserializeOptions::new().deny_unknown_fields(false);
    let msg = DynamicMessage::deserialize_with_options(input, &mut de, &options)
        .map_err(|e| format!("Protobuf encode error: {e}"))?;
    de.end().map_err(|e| format!("Protobuf encode error: {e}"))?;
    Ok(msg)
}

fn dynamic_to_json(msg: &DynamicMessage) -> Result<String, String> {
    let mut buf = Vec::new();
    let mut ser = serde_json::Serializer::new(&mut buf);
    msg.serialize_with_options(&mut ser, &SerializeOptions::default())
        .map_err(|e| format!("JSON encode error: {e}"))?;
    String::from_utf8(buf).map_err(|e| format!("JSON format error: {e}"))
}

fn elapsed_ms(since: Instant) -> f64 {
    since.elapsed().as_secs_f64() * 1000.0
}

fn header_bytes(headers: &HashMap<String, String>) -> u32 {
    headers
        .iter()
        .map(|(k, v)| k.len() + v.len() + 4)
        .sum::<usize>() as u32
}

fn size_info(body_bytes: usize, headers_bytes: u32) -> SizeInfo {
    let body_bytes = body_bytes as u32;
    SizeInfo {
        headers_bytes,
        body_bytes,
        total_bytes: headers_bytes.saturating_add(body_bytes),
    }
}

fn build_timing(
    total_ms: f64,
    compile_ms: f64,
    connect_ms: f64,
    rpc_ms: f64,
    decode_ms: f64,
    is_https: bool,
) -> TimingInfo {
    TimingInfo {
        total_ms,
        dns_lookup_ms: 0.0,
        tcp_handshake_ms: if is_https { 0.0 } else { connect_ms },
        tls_handshake_ms: if is_https { connect_ms } else { 0.0 },
        transfer_start_ms: compile_ms + connect_ms,
        ttfb_ms: rpc_ms,
        content_download_ms: decode_ms,
    }
}

fn metadata_to_map(metadata: &MetadataMap) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for kv in metadata.iter() {
        match kv {
            KeyAndValueRef::Ascii(key, value) => {
                if let Ok(val) = value.to_str() {
                    out.insert(key.as_str().to_string(), val.to_string());
                }
            }
            KeyAndValueRef::Binary(key, value) => {
                out.insert(
                    key.as_str().to_string(),
                    format!("<binary {} bytes>", value.as_ref().len()),
                );
            }
        }
    }
    out
}

/// gRPC initial metadata vs trailing metadata (`grpc-*` keys are trailers).
fn split_grpc_metadata(
    all: HashMap<String, String>,
) -> (HashMap<String, String>, HashMap<String, String>) {
    let mut headers = HashMap::new();
    let mut trailers = HashMap::new();
    for (k, v) in all {
        if k.starts_with("grpc-") {
            trailers.insert(k, v);
        } else {
            headers.insert(k, v);
        }
    }
    (headers, trailers)
}

fn metadata_byte_len(map: &HashMap<String, String>) -> u32 {
    map.iter()
        .map(|(k, v)| k.len() + v.len() + 4)
        .sum::<usize>() as u32
}

fn build_grpc_response(
    status_code: i32,
    status_message: String,
    body: Option<String>,
    timing: TimingInfo,
    request_size: SizeInfo,
    response_size: SizeInfo,
    headers: HashMap<String, String>,
    trailers: HashMap<String, String>,
    error: Option<String>,
) -> GrpcCallResponse {
    GrpcCallResponse {
        status_code,
        status_message,
        body,
        timing_ms: timing.total_ms,
        timing,
        request_size,
        response_size,
        headers,
        trailers,
        error,
    }
}

/// Build a connected channel. `Endpoint::from_shared` alone does not enable TLS for https URLs.
async fn connect_channel(url: &str) -> Result<Channel, String> {
    let endpoint = Endpoint::new(url.to_string())
        .map_err(|e| format!("Invalid gRPC endpoint: {e}"))?
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(60));

    endpoint
        .connect()
        .await
        .map_err(|e| format!("Connect failed: {e}"))
}

fn metadata_from_headers(headers: &HashMap<String, String>, auth: &AuthType) -> Result<MetadataMap, String> {
    let mut merged = headers.clone();
    apply_auth_to_headers(&mut merged, auth);
    let mut map = MetadataMap::new();
    for (key, value) in merged {
        let key_lower = key.to_lowercase();
        if key_lower == "content-type" || key_lower == "te" || key_lower == "user-agent" {
            continue;
        }
        let ascii_key = tonic::metadata::MetadataKey::from_bytes(key.as_bytes())
            .map_err(|e| format!("Invalid metadata key '{key}': {e}"))?;
        let ascii_val = tonic::metadata::MetadataValue::try_from(value.as_str())
            .map_err(|e| format!("Invalid metadata value for '{key}': {e}"))?;
        map.insert(ascii_key, ascii_val);
    }
    Ok(map)
}

#[derive(Clone, Default)]
struct BytesCodec;

#[derive(Clone, Default)]
struct BytesEncoder;

#[derive(Clone, Default)]
struct BytesDecoder;

impl Encoder for BytesEncoder {
    type Item = Vec<u8>;
    type Error = Status;

    fn encode(&mut self, item: Self::Item, buf: &mut EncodeBuf<'_>) -> Result<(), Self::Error> {
        buf.put(item.as_slice());
        Ok(())
    }
}

impl Decoder for BytesDecoder {
    type Item = Vec<u8>;
    type Error = Status;

    fn decode(&mut self, buf: &mut DecodeBuf<'_>) -> Result<Option<Self::Item>, Self::Error> {
        if buf.remaining() == 0 {
            return Ok(None);
        }
        let len = buf.remaining();
        Ok(Some(buf.copy_to_bytes(len).to_vec()))
    }
}

impl Codec for BytesCodec {
    type Encode = Vec<u8>;
    type Decode = Vec<u8>;
    type Encoder = BytesEncoder;
    type Decoder = BytesDecoder;

    fn encoder(&mut self) -> Self::Encoder {
        BytesEncoder
    }

    fn decoder(&mut self) -> Self::Decoder {
        BytesDecoder
    }
}

#[tauri::command]
#[specta::specta]
pub async fn grpc_call(req: GrpcCallRequest) -> Result<GrpcCallResponse, String> {
    let total_start = Instant::now();
    let is_https = req.url.starts_with("https://");

    let compile_start = Instant::now();
    let pool = compile_descriptor_pool(&req.proto)?;
    let compile_ms = elapsed_ms(compile_start);

    let (input_desc, output_desc, path_str) =
        find_method(&pool, &req.service, &req.method)?;

    let request_msg = json_to_dynamic(
        input_desc,
        if req.body.trim().is_empty() { "{}" } else { &req.body },
    )?;
    let request_bytes = request_msg.encode_to_vec();
    let req_header_bytes = header_bytes(&req.headers);
    let request_size = size_info(request_bytes.len(), req_header_bytes);

    let endpoint = if req.url.starts_with("http://") || req.url.starts_with("https://") {
        req.url.clone()
    } else {
        format!("http://{}", req.url)
    };

    let path = PathAndQuery::from_maybe_shared(path_str)
        .map_err(|e| format!("Invalid gRPC path: {e}"))?;

    let uri: Uri = endpoint
        .parse()
        .map_err(|e| format!("Invalid gRPC URL: {e}"))?;

    let connect_start = Instant::now();
    let channel = connect_channel(&endpoint).await?;
    let connect_ms = elapsed_ms(connect_start);

    let mut grpc = Grpc::with_origin(channel, uri);
    let codec = BytesCodec;

    let mut tonic_req = Request::new(request_bytes);
    *tonic_req.metadata_mut() = metadata_from_headers(&req.headers, &req.auth)?;

    grpc.ready()
        .await
        .map_err(|e| format!("gRPC client not ready: {e}"))?;

    let rpc_start = Instant::now();
    match grpc.unary(tonic_req, path, codec).await {
        Ok(response) => {
            let rpc_ms = elapsed_ms(rpc_start);
            let (headers, trailers) =
                split_grpc_metadata(metadata_to_map(response.metadata()));
            let decode_start = Instant::now();
            let output = DynamicMessage::decode(output_desc, response.into_inner().as_ref())
                .map_err(|e| format!("Decode response error: {e}"))?;
            let body = dynamic_to_json(&output).ok();
            let decode_ms = elapsed_ms(decode_start);
            let total_ms = elapsed_ms(total_start);
            let timing = build_timing(total_ms, compile_ms, connect_ms, rpc_ms, decode_ms, is_https);
            let body_len = body.as_ref().map(|s| s.len()).unwrap_or(0);
            let meta_bytes = metadata_byte_len(&headers) + metadata_byte_len(&trailers);
            let response_size = size_info(body_len, meta_bytes);

            Ok(build_grpc_response(
                0,
                "OK".to_string(),
                body,
                timing,
                request_size,
                response_size,
                headers,
                trailers,
                None,
            ))
        }
        Err(status) => {
            let rpc_ms = elapsed_ms(rpc_start);
            let total_ms = elapsed_ms(total_start);
            let timing = build_timing(total_ms, compile_ms, connect_ms, rpc_ms, 0.0, is_https);
            let (headers, trailers) = split_grpc_metadata(metadata_to_map(status.metadata()));
            let meta_bytes = metadata_byte_len(&headers) + metadata_byte_len(&trailers);

            Ok(build_grpc_response(
                status.code() as i32,
                status.message().to_string(),
                None,
                timing,
                request_size,
                size_info(0, meta_bytes),
                headers,
                trailers,
                Some(status.to_string()),
            ))
        }
    }
}
