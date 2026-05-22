use std::collections::HashMap;

use crate::types::{ApiKeyLocation, AuthType};

/// Apply auth to an HTTP header map (does not mutate query params).
pub fn apply_auth_to_headers(headers: &mut HashMap<String, String>, auth: &AuthType) {
    match auth {
        AuthType::Basic { username, password } => {
            let token = base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                format!("{username}:{password}"),
            );
            headers.insert("Authorization".to_string(), format!("Basic {token}"));
        }
        AuthType::Bearer { token } => {
            headers.insert("Authorization".to_string(), format!("Bearer {token}"));
        }
        AuthType::ApiKey {
            key,
            value,
            add_to: ApiKeyLocation::Header,
        } => {
            headers.insert(key.clone(), value.clone());
        }
        AuthType::None | AuthType::ApiKey { .. } => {}
    }
}
