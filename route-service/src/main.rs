mod gtfs;
mod layers;
mod opt;
mod server;

use clap::Parser;
use server::server::start_server;

/// Transit route optimization and evaluation service
#[derive(Parser, Debug)]
#[clap(author, version, about)]
struct Args {
    /// Path to GTFS data
    #[clap(
        long,
        default_value = "/Users/jrayappa/transit-works/transit-works/scripts/city_data/toronto/gtfs"
    )]
    gtfs_path: String,

    /// Path to database
    #[clap(
        long,
        default_value = "/Users/jrayappa/transit-works/transit-works/scripts/city_db/toronto.db"
    )]
    db_path: String,

    /// Server host address
    #[clap(long, default_value = "127.0.0.1")]
    host: String,

    /// Server port
    #[clap(long, default_value_t = 8080)]
    port: u16,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();

    // Parse command line arguments
    let args = Args::parse();

    // Start server with parsed arguments
    start_server(&args.gtfs_path, &args.db_path, &args.host, args.port).await
}
