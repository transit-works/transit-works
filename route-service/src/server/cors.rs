use actix_cors::Cors;
use actix_web::http::header;

pub fn cors_middleware() -> Cors {
    Cors::default()
        .allowed_origin("http://localhost:3000") 
        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
        .allowed_headers(vec![
            header::AUTHORIZATION,
            header::ACCEPT,
            header::CONTENT_TYPE,
        ])
        .max_age(3600)
}
