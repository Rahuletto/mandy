use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use crate::types::{GraphQLIntrospectRequest, GraphQLIntrospectResponse};

static INTROSPECTION_QUERY: &str = r#"
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      ...FullType
    }
    directives {
      name
      description
      locations
      args {
        ...InputValue
      }
    }
  }
}

fragment FullType on __Type {
  kind
  name
  description
  fields(includeDeprecated: true) {
    name
    description
    args {
      ...InputValue
    }
    type {
      ...TypeRef
    }
    isDeprecated
    deprecationReason
  }
  inputFields {
    ...InputValue
  }
  interfaces {
    ...TypeRef
  }
  enumValues(includeDeprecated: true) {
    name
    description
    isDeprecated
    deprecationReason
  }
  possibleTypes {
    ...TypeRef
  }
}

fragment InputValue on __InputValue {
  name
  description
  type { ...TypeRef }
  defaultValue
}

fragment TypeRef on __Type {
  kind
  name
  ofType {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }
      }
    }
  }
}
"#;

fn build_curl_handle(
    url: &str,
    headers: &HashMap<String, String>,
    body: &str,
) -> Result<curl::easy::Easy, String> {
    let mut easy = curl::easy::Easy::new();

    easy.url(url).map_err(|e| format!("URL error: {e}"))?;
    easy.post(true).map_err(|e| e.to_string())?;
    easy.timeout(Duration::from_secs(30))
        .map_err(|e| e.to_string())?;
    easy.follow_location(true).map_err(|e| e.to_string())?;
    easy.max_redirections(5).map_err(|e| e.to_string())?;
    easy.ssl_verify_peer(true).map_err(|e| e.to_string())?;
    easy.ssl_verify_host(true).map_err(|e| e.to_string())?;

    // Use HTTP/2 with TLS fallback
    easy.http_version(curl::easy::HttpVersion::V2TLS)
        .map_err(|e| e.to_string())?;

    let mut header_list = curl::easy::List::new();

    // Default Content-Type
    header_list
        .append("Content-Type: application/json")
        .map_err(|e| e.to_string())?;

    // Caller-supplied headers (may override Content-Type)
    for (k, v) in headers {
        header_list
            .append(&format!("{}: {}", k, v))
            .map_err(|e| e.to_string())?;
    }

    easy.http_headers(header_list)
        .map_err(|e| e.to_string())?;

    let body_bytes = body.as_bytes().to_vec();
    easy.post_field_size(body_bytes.len() as u64)
        .map_err(|e| e.to_string())?;

    Ok(easy)
}

fn execute_introspection(
    url: &str,
    headers: &HashMap<String, String>,
) -> Result<GraphQLIntrospectResponse, String> {
    let body = serde_json::json!({ "query": INTROSPECTION_QUERY }).to_string();

    let mut easy = build_curl_handle(url, headers, &body)?;

    let mut response_body: Vec<u8> = Vec::new();
    let body_bytes = body.into_bytes();
    let cursor = Arc::new(Mutex::new(Cursor::new(body_bytes)));

    {
        let mut transfer = easy.transfer();

        transfer
            .read_function(|buf| {
                let mut c = cursor.lock().unwrap();
                let n = c.read(buf).unwrap_or(0);
                Ok(n)
            })
            .map_err(|e| e.to_string())?;

        transfer
            .write_function(|data| {
                response_body.extend_from_slice(data);
                Ok(data.len())
            })
            .map_err(|e| e.to_string())?;

        transfer.perform().map_err(|e| {
            let mut msg = String::new();
            if e.is_couldnt_resolve_host() {
                msg.push_str("Could not resolve host. ");
            }
            if e.is_couldnt_connect() {
                msg.push_str("Could not connect. ");
            }
            if e.is_operation_timedout() {
                msg.push_str("Request timed out. ");
            }
            if e.is_ssl_connect_error() {
                msg.push_str("SSL connect error. ");
            }
            msg.push_str(&e.to_string());
            msg
        })?;
    }

    let status = easy.response_code().unwrap_or(0) as u16;

    if status == 0 {
        return Ok(GraphQLIntrospectResponse {
            schema_json: None,
            error: Some("No response received from server".to_string()),
        });
    }

    if status < 200 || status >= 300 {
        let body_str = String::from_utf8_lossy(&response_body).to_string();
        return Ok(GraphQLIntrospectResponse {
            schema_json: None,
            error: Some(format!("HTTP {status}: {body_str}")),
        });
    }

    // Parse the response JSON
    let json: serde_json::Value =
        serde_json::from_slice(&response_body).map_err(|e| format!("Invalid JSON: {e}"))?;

    // Check for GraphQL-level errors (errors present but no data)
    if let Some(errors) = json.get("errors") {
        if json.get("data").is_none() || json["data"].is_null() {
            let msg = errors
                .as_array()
                .and_then(|arr| {
                    let msgs: Vec<String> = arr
                        .iter()
                        .filter_map(|e| e.get("message")?.as_str().map(str::to_string))
                        .collect();
                    if msgs.is_empty() {
                        None
                    } else {
                        Some(msgs.join("; "))
                    }
                })
                .unwrap_or_else(|| errors.to_string());
            return Ok(GraphQLIntrospectResponse {
                schema_json: None,
                error: Some(msg),
            });
        }
    }

    // Extract the `data` field which is the introspection result
    let data = json
        .get("data")
        .cloned()
        .ok_or_else(|| "Response missing 'data' field".to_string())?;

    let schema_json =
        serde_json::to_string(&data).map_err(|e| format!("Failed to serialise schema: {e}"))?;

    Ok(GraphQLIntrospectResponse {
        schema_json: Some(schema_json),
        error: None,
    })
}

/// Fetch and return a GraphQL server's introspection schema.
///
/// This runs the full introspection query via the Rust/curl stack so the
/// frontend never makes a direct network request.
#[tauri::command]
#[specta::specta]
pub async fn graphql_introspect(
    req: GraphQLIntrospectRequest,
) -> Result<GraphQLIntrospectResponse, String> {
    tokio::task::spawn_blocking(move || execute_introspection(&req.url, &req.headers))
        .await
        .map_err(|e| format!("Task error: {e}"))?
}
