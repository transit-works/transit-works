use crate::gtfs::error::{Error, LineError};
use crate::gtfs::structs::*;

use csv::StringRecord;
use rusqlite::{params, Connection};
use serde::{Deserialize, Deserializer, Serialize};
use std::{fs::File, io::Read, path::Path, str::FromStr};

/// Helper function to deserialize optional fields that might fail to parse
pub fn deserialize_opt<'de, T, D>(deserializer: D) -> Result<Option<T>, D::Error>
where
    T: FromStr,
    D: Deserializer<'de>,
{
    let opt = Option::<String>::deserialize(deserializer)?;
    match opt {
        Some(s) if s.trim().is_empty() => Ok(None),
        Some(s) => match T::from_str(&s) {
            Ok(val) => Ok(Some(val)),
            Err(_) => Ok(None), // Instead of failing, just return None
        },
        None => Ok(None),
    }
}

/// GTFS dataset
/// https://gtfs.org/documentation/schedule/reference/#dataset-files
#[derive(Serialize, Deserialize)]
pub struct GtfsDataSet {
    pub agencies: Result<Vec<Agency>, Error>,
    pub stops: Result<Vec<Stop>, Error>,
    pub routes: Result<Vec<Route>, Error>,
    pub trips: Result<Vec<Trip>, Error>,
    pub stop_times: Result<Vec<StopTime>, Error>,
    pub calendar: Option<Result<Vec<Calendar>, Error>>,
    pub calendar_dates: Option<Result<Vec<CalendarDate>, Error>>,
    pub shapes: Option<Result<Vec<Shape>, Error>>,
    pub fare_attributes: Option<Result<Vec<FareAttribute>, Error>>,
    pub fare_rules: Option<Result<Vec<FareRule>, Error>>,
    pub frequencies: Option<Result<Vec<Frequency>, Error>>,
    pub transfers: Option<Result<Vec<Transfer>, Error>>,
    pub pathways: Option<Result<Vec<Pathway>, Error>>,
    pub feed_info: Option<Result<Vec<FeedInfo>, Error>>,
    pub translations: Option<Result<Vec<Translation>, Error>>,
}

impl GtfsDataSet {
    pub fn from_path<P>(path: P) -> Result<GtfsDataSet, Error>
    where
        P: AsRef<Path>,
    {
        let p = path.as_ref();
        if p.is_file() {
            GtfsDataSet::read_from_sqlite3(p)
        } else if p.is_dir() {
            GtfsDataSet::read_from_dir(p)
        } else {
            Err(Error::NotFileNorDirectory(format!("{}", p.display())))
        }
    }

    #[allow(dead_code)]
    pub fn print_stats(&self) {
        println!("GTFS data:");
        println!("  Agencies: {}", mandatory_file_summary(&self.agencies));
        println!("  Stops: {}", mandatory_file_summary(&self.stops));
        println!("  Routes: {}", mandatory_file_summary(&self.routes));
        println!("  Trips: {}", mandatory_file_summary(&self.trips));
        println!("  Stop times: {}", mandatory_file_summary(&self.stop_times));
        println!("  Calendar: {}", optional_file_summary(&self.calendar));
        println!(
            "  Calendar Dates: {}",
            optional_file_summary(&self.calendar_dates)
        );
        println!("  Shapes: {}", optional_file_summary(&self.shapes));
        println!(
            "  Fare Attributes: {}",
            optional_file_summary(&self.fare_attributes)
        );
        println!("  Fare Rules: {}", optional_file_summary(&self.fare_rules));
        println!(
            "  Frequencies: {}",
            optional_file_summary(&self.frequencies)
        );
        println!("  Transfers: {}", optional_file_summary(&self.transfers));
        println!("  Pathways: {}", optional_file_summary(&self.pathways));
        println!("  Feed info: {}", optional_file_summary(&self.feed_info));
        println!(
            "  Translations: {}",
            optional_file_summary(&self.translations)
        );
    }

    fn read_from_dir(path: &Path) -> Result<GtfsDataSet, Error> {
        Ok(GtfsDataSet {
            agencies: GtfsDataSet::read_obj_from_path(path, "agency.txt"),
            stops: GtfsDataSet::read_obj_from_path(path, "stops.txt"),
            routes: GtfsDataSet::read_obj_from_path(path, "routes.txt"),
            trips: GtfsDataSet::read_obj_from_path(path, "trips.txt"),
            stop_times: GtfsDataSet::read_obj_from_path(path, "stop_times.txt"),
            calendar: GtfsDataSet::optional_read_obj_from_path(path, "calendar.txt"),
            calendar_dates: GtfsDataSet::optional_read_obj_from_path(path, "calendar_dates.txt"),
            shapes: GtfsDataSet::optional_read_obj_from_path(path, "shapes.txt"),
            fare_attributes: GtfsDataSet::optional_read_obj_from_path(path, "fare_attributes.txt"),
            fare_rules: GtfsDataSet::optional_read_obj_from_path(path, "fare_rules.txt"),
            frequencies: GtfsDataSet::optional_read_obj_from_path(path, "frequencies.txt"),
            transfers: GtfsDataSet::optional_read_obj_from_path(path, "transfers.txt"),
            pathways: GtfsDataSet::optional_read_obj_from_path(path, "pathways.txt"),
            feed_info: GtfsDataSet::optional_read_obj_from_path(path, "feed_info.txt"),
            translations: GtfsDataSet::optional_read_obj_from_path(path, "translations.txt"),
        })
    }

    fn read_from_sqlite3(path: &Path) -> Result<GtfsDataSet, Error> {
        let conn = Connection::open(path)?;
        Ok(GtfsDataSet {
            agencies: GtfsDataSet::read_obj_sqlite3(&conn, "gtfs_agency"),
            stops: GtfsDataSet::read_obj_sqlite3(&conn, "gtfs_stops"),
            routes: GtfsDataSet::read_obj_sqlite3(&conn, "gtfs_routes"),
            trips: GtfsDataSet::read_obj_sqlite3(&conn, "gtfs_trips"),
            stop_times: GtfsDataSet::read_obj_sqlite3(&conn, "gtfs_stop_times"),
            calendar: GtfsDataSet::optional_read_obj_sqlite3(&conn, "gtfs_calendar"),
            calendar_dates: GtfsDataSet::optional_read_obj_sqlite3(&conn, "gtfs_calendar_dates"),
            shapes: GtfsDataSet::optional_read_obj_sqlite3(&conn, "gtfs_shapes"),
            fare_attributes: GtfsDataSet::optional_read_obj_sqlite3(&conn, "gtfs_fare_attributes"),
            fare_rules: GtfsDataSet::optional_read_obj_sqlite3(&conn, "gtfs_fare_rules"),
            frequencies: GtfsDataSet::optional_read_obj_sqlite3(&conn, "gtfs_frequencies"),
            transfers: GtfsDataSet::optional_read_obj_sqlite3(&conn, "gtfs_transfers"),
            pathways: GtfsDataSet::optional_read_obj_sqlite3(&conn, "gtfs_pathways"),
            feed_info: GtfsDataSet::optional_read_obj_sqlite3(&conn, "gtfs_feed_info"),
            translations: GtfsDataSet::optional_read_obj_sqlite3(&conn, "gtfs_translations"),
        })
    }

    fn read_obj_from_path<O>(path: &Path, file_name: &str) -> Result<Vec<O>, Error>
    where
        for<'de> O: Deserialize<'de>,
    {
        let p = path.join(file_name);
        if p.exists() {
            File::open(p)
                .map_err(|e| Error::NamedFileIO {
                    file_name: file_name.to_owned(),
                    source: Box::new(e),
                })
                .and_then(|r| GtfsDataSet::read_obj(r, &file_name))
        } else {
            Err(Error::MissingFile(file_name.to_owned()))
        }
    }

    fn optional_read_obj_from_path<O>(path: &Path, file_name: &str) -> Option<Result<Vec<O>, Error>>
    where
        for<'de> O: Deserialize<'de>,
    {
        File::open(path.join(file_name))
            .ok()
            .map(|r| GtfsDataSet::read_obj(r, file_name))
    }

    fn read_obj<T, O>(mut reader: T, file_name: &str) -> Result<Vec<O>, Error>
    where
        for<'de> O: Deserialize<'de>,
        T: std::io::Read,
    {
        let mut bom = [0; 3];
        reader
            .read_exact(&mut bom)
            .map_err(|e| Error::NamedFileIO {
                file_name: file_name.to_owned(),
                source: Box::new(e),
            })?;

        let chained = if bom != [0xefu8, 0xbbu8, 0xbfu8] {
            bom.chain(reader)
        } else {
            [].chain(reader)
        };

        let mut reader = csv::ReaderBuilder::new()
            .flexible(true)
            .trim(csv::Trim::None)
            .from_reader(chained);
        // We store the headers to be able to return them in case of errors
        let headers = reader
            .headers()
            .map_err(|e| Error::CSVError {
                file_name: file_name.to_owned(),
                source: e,
                line_in_error: None,
            })?
            .clone()
            .into_iter()
            .map(|x| x.trim())
            .collect::<csv::StringRecord>();

        // Pre-allocate a StringRecord for performance reasons
        let mut rec = csv::StringRecord::new();
        let mut objs = Vec::new();

        // Read each record into the pre-allocated StringRecord one at a time
        while reader.read_record(&mut rec).map_err(|e| Error::CSVError {
            file_name: file_name.to_owned(),
            source: e,
            line_in_error: None,
        })? {
            let obj = rec
                .deserialize(Some(&headers))
                .map_err(|e| Error::CSVError {
                    file_name: file_name.to_owned(),
                    source: e,
                    line_in_error: Some(LineError {
                        headers: headers.into_iter().map(String::from).collect(),
                        values: rec.into_iter().map(String::from).collect(),
                    }),
                })?;
            objs.push(obj);
        }
        Ok(objs)
    }

    fn optional_read_obj_sqlite3<O>(
        conn: &Connection,
        table_name: &str,
    ) -> Option<Result<Vec<O>, Error>>
    where
        for<'de> O: Deserialize<'de>,
    {
        match GtfsDataSet::check_table_exists(conn, table_name) {
            Ok(_) => Some(GtfsDataSet::read_obj_sqlite3(conn, table_name)),
            Err(_) => None,
        }
    }

    fn read_obj_sqlite3<O>(conn: &Connection, table_name: &str) -> Result<Vec<O>, Error>
    where
        for<'de> O: Deserialize<'de>,
    {
        let headers = GtfsDataSet::get_column_names(conn, table_name)?
            .into_iter()
            .collect::<csv::StringRecord>();
        let mut stmt = conn.prepare(&format!("SELECT * FROM {}", table_name))?;
        let row_objs = stmt.query_map([], |row| {
            // Rusqlite does not natively support deserializing rows so we convert to StringRecord
            // Will need to implement custom RowDeserializer to speed things up
            let vals: Vec<String> = (0..headers.len())
                .map(|i| row.get::<usize, String>(i).unwrap_or_default())
                .collect();
            StringRecord::from(vals)
                .deserialize(Some(&headers))
                .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))
        })?;
        let mut objs = Vec::new();
        for obj in row_objs {
            objs.push(obj?);
        }
        Ok(objs)
    }

    fn get_column_names(conn: &Connection, table_name: &str) -> Result<Vec<String>, Error> {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info('{}')", table_name))?;
        let rows = stmt.query_map([], |row| Ok(row.get(1)?))?;

        let mut column_names: Vec<String> = Vec::new();
        for row in rows {
            column_names.push(row?);
        }

        Ok(column_names)
    }

    fn check_table_exists(conn: &Connection, table_name: &str) -> Result<(), Error> {
        let mut stmt =
            conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")?;
        let mut rows = stmt.query(params![table_name])?;
        if rows.next()?.is_none() {
            Err(Error::MissingFile(table_name.to_owned()))
        } else {
            Ok(())
        }
    }
}

fn mandatory_file_summary<T>(objs: &Result<Vec<T>, Error>) -> String {
    match objs {
        Ok(vec) => format!("{} objects", vec.len()),
        Err(e) => format!("{e}"),
    }
}

fn optional_file_summary<T>(objs: &Option<Result<Vec<T>, Error>>) -> String {
    match objs {
        Some(objs) => mandatory_file_summary(objs),
        None => "File not present".to_string(),
    }
}
