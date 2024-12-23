use crate::gtfs::error::{Error, LineError};
use crate::gtfs::structs::*;

use serde::Deserialize;
use std::{fs::File, io::Read, path::Path};

/// GTFS dataset
/// https://gtfs.org/documentation/schedule/reference/#dataset-files
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
        P: AsRef<Path>
    {
        let p = path.as_ref();
        if p.is_file() {
            let reader = File::open(p);
            GtfsDataSet::read_from_reader(&reader?)
        } else if p.is_dir() {
            GtfsDataSet::read_from_dir(p)
        } else {
            Err(Error::NotFileNorDirectory(format!("{}", p.display())))
        }
    }

    pub fn print_stats(&self) {
        println!("GTFS data:");
        println!("  Agencies: {}", mandatory_file_summary(&self.agencies));
        println!("  Stops: {}", mandatory_file_summary(&self.stops));
        println!("  Routes: {}", mandatory_file_summary(&self.routes));
        println!("  Trips: {}", mandatory_file_summary(&self.trips));
        println!("  Stop times: {}", mandatory_file_summary(&self.stop_times));
        println!("  Calendar: {}", optional_file_summary(&self.calendar));
        println!("  Calendar Dates: {}", optional_file_summary(&self.calendar_dates));
        println!("  Shapes: {}", optional_file_summary(&self.shapes));
        println!("  Fare Attributes: {}", optional_file_summary(&self.fare_attributes));
        println!("  Fare Rules: {}", optional_file_summary(&self.fare_rules));
        println!("  Frequencies: {}", optional_file_summary(&self.frequencies));
        println!("  Transfers: {}", optional_file_summary(&self.transfers));
        println!("  Pathways: {}", optional_file_summary(&self.pathways));
        println!("  Feed info: {}", optional_file_summary(&self.feed_info));
        println!("  Translations: {}", optional_file_summary(&self.translations));
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

    fn read_from_reader(_file: &File) -> Result<GtfsDataSet, Error> {
        panic!("Not yet implemented")
    }

    fn read_obj_from_path<O>(path: &Path, file_name: &str) -> Result<Vec<O>, Error>
    where
        for<'de> O: Deserialize<'de>,
    {
        let p = path.join(file_name);
        if p.exists() {
            File::open(p)
                .map_err(|e| Error::NamedFileIO { file_name: file_name.to_owned(), source: Box::new(e) })
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
