mod gtfs;
mod server;

use server::server::start_server;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();
    start_server().await
}
