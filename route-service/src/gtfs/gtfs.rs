use crate::gtfs::error::{Error, LineError};

use serde::{Deserialize, Serialize};
use std::{fs::{read_dir, File}, io::Read, path::{Path, PathBuf}};

/// GTFS dataset
/// https://gtfs.org/documentation/schedule/reference/#dataset-files
pub struct GtfsDataSet {
    pub agencies: Vec<Agency>,
    pub stops: Vec<Stop>,
    pub routes: Vec<Route>,
    pub trips: Vec<Trip>,
    pub stop_times: Vec<StopTime>,
    pub calendar: Option<Vec<Calendar>>,
    pub calendar_dates: Option<Vec<CalendarDate>>,
    pub shapes: Option<Vec<Shape>>,
    pub fare_attributes: Option<Vec<FareAttribute>>,
    pub fare_rules: Option<Vec<FareRule>>,
    pub frequencies: Option<Vec<Frequency>>,
    pub transfers: Option<Vec<Transfer>>,
    pub pathways: Option<Vec<Pathway>>,
    pub feed_info: Option<Vec<FeedInfo>>,
    pub translations: Option<Vec<Translation>>,
}

impl GtfsDataSet {
    pub fn from_path(path: &Path) -> Result<GtfsDataSet, Error> {
        if path.is_file() {
            let reader = File::open(path);
            GtfsDataSet::read_from_reader(&reader?)
        } else if path.is_dir() {
            GtfsDataSet::read_from_dir(path)
        } else {
            Err(Error::NotFileNorDirectory(format!("{}", path.display())))
        }
    }

    fn read_from_dir(path: &Path) -> Result<GtfsDataSet, Error> {
        Ok(GtfsDataSet {
            agencies: GtfsDataSet::read_obj_from_path(path.join("agencies.txt"))?, 
            stops: GtfsDataSet::read_obj_from_path(path.join("stops.txt"))?, 
            routes: GtfsDataSet::read_obj_from_path(path.join("routes.txt"))?, 
            trips: GtfsDataSet::read_obj_from_path(path.join("trips.txt"))?, 
            stop_times: GtfsDataSet::read_obj_from_path(path.join("stop_times.txt"))?, 
            calendar: GtfsDataSet::optional_read_obj_from_path(path.join("calendar.txt"))?,
            calendar_dates: GtfsDataSet::optional_read_obj_from_path(path.join("calendar_dates.txt"))?, 
            shapes: GtfsDataSet::optional_read_obj_from_path(path.join("shapes.txt"))?, 
            fare_attributes: GtfsDataSet::optional_read_obj_from_path(path.join("fare_attributes.txt"))?, 
            fare_rules: GtfsDataSet::optional_read_obj_from_path(path.join("fare_rules.txt"))?, 
            frequencies: GtfsDataSet::optional_read_obj_from_path(path.join("frequencies.txt"))?, 
            transfers: GtfsDataSet::optional_read_obj_from_path(path.join("transfers.txt"))?, 
            pathways: GtfsDataSet::optional_read_obj_from_path(path.join("pathways.txt"))?, 
            feed_info: GtfsDataSet::optional_read_obj_from_path(path.join("feed_info.txt"))?, 
            translations: GtfsDataSet::optional_read_obj_from_path(path.join("translations.txt"))?,
        })
    }

    fn read_from_reader(file: &File) -> Result<GtfsDataSet, Error> {
        panic!("Not yet implemented")
    }

    fn read_obj_from_path<O>(path: PathBuf) -> Result<Vec<O>, Error>
    where
        for<'de> O: Deserialize<'de>,
    {
        let file_name = path
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("invalid_file_name")
            .to_string();

        if path.exists() {
            File::open(path)
                .map_err(|e| Error::NamedFileIO { file_name: file_name.to_owned(), source: Box::new(e) })
                .and_then(|r| GtfsDataSet::read_obj(r, &file_name))
        } else {
            Err(Error::MissingFile(file_name))
        }
    }

    fn optional_read_obj_from_path<O>(path: PathBuf) -> Result<Option<Vec<O>>, Error>
    where
        for<'de> O: Deserialize<'de>,
    {
        let file_name = path
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("invalid_file_name")
            .to_string();

        if path.exists() {
            File::open(path)
                .map_err(|e| Error::NamedFileIO { file_name: file_name.to_owned(), source: Box::new(e) })
                .and_then(|r| Ok(Some(GtfsDataSet::read_obj(r, &file_name)?)))
        } else {
            Ok(None)
        }
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

/// Agency representing a public transit operator. 
/// https://gtfs.org/documentation/schedule/reference/#agencytxt
#[derive(Debug, Serialize, Deserialize)]
pub struct Agency {
    pub agency_id: Option<String>,
    pub agency_name: String,
    pub agency_url: String,
    pub agency_timezone: String,
    pub agency_lang: Option<String>,
    pub agency_phone: Option<String>,
    pub agency_fare_url: Option<String>,
    pub agency_email: Option<String>,
}

/// A physical stop, station, or area. 
/// https://gtfs.org/documentation/schedule/reference/#stopstxt
#[derive(Debug, Serialize, Deserialize)]
pub struct Stop {
    pub stop_id: String,
    pub stop_code: Option<String>,
    pub stop_name: Option<String>,
    pub tts_stop_name: Option<String>,
    pub stop_desc: Option<String>,
    pub stop_lat: Option<f64>,
    pub stop_lon: Option<f64>,
    pub zone_id: Option<String>,
    pub stop_url: Option<String>,
    pub location_type: Option<LocationType>,
    pub parent_station: Option<String>,
    pub stop_timezone: Option<String>,
    pub wheelchair_boarding: Option<WheelchairBoarding>,
    pub level_id: Option<String>,
    pub platform_code: Option<String>,
}

/// Location type for a stop.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Hash, Clone, Copy)]
pub enum LocationType {
    #[serde(rename = "0")]
    StopOrPlatform,
    #[serde(rename = "1")]
    Station,
    #[serde(rename = "2")]
    EntranceExit,
    #[serde(rename = "3")]
    GenericNode,
    #[serde(rename = "4")]
    BoardingArea,
}

/// Accessibility of a stop.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Hash, Clone, Copy)]
pub enum WheelchairBoarding {
    #[serde(rename = "0")]
    NoInformation,
    #[serde(rename = "1")]
    SomeVehiclesAccessible,
    #[serde(rename = "2")]
    NotAccessible,
}

/// A transportation route. 
/// https://gtfs.org/documentation/schedule/reference/#routestxt
#[derive(Debug, Serialize, Deserialize)]
pub struct Route {
    pub route_id: String,
    pub agency_id: Option<String>,
    pub route_short_name: Option<String>,
    pub route_long_name: Option<String>,
    pub route_desc: Option<String>,
    pub route_type: RouteType,
    pub route_url: Option<String>,
    pub route_color: Option<String>,
    pub route_text_color: Option<String>,
    pub route_sort_order: Option<i32>,
}

/// Type of transportation used on a route.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Hash, Clone, Copy)]
pub enum RouteType {
    #[serde(rename = "0")]
    Tram,
    #[serde(rename = "1")]
    Subway,
    #[serde(rename = "2")]
    Rail,
    #[serde(rename = "3")]
    Bus,
    #[serde(rename = "4")]
    Ferry,
    #[serde(rename = "5")]
    CableTram,
    #[serde(rename = "6")]
    AerialLift,
    #[serde(rename = "7")]
    Funicular,
    #[serde(rename = "11")]
    Trolleybus,
    #[serde(rename = "12")]
    Monorail,
}

/// A scheduled trip for a route. 
/// https://gtfs.org/documentation/schedule/reference/#tripstxt
#[derive(Debug, Serialize, Deserialize)]
pub struct Trip {
    pub route_id: String,
    pub service_id: String,
    pub trip_id: String,
    pub trip_headsign: Option<String>,
    pub trip_short_name: Option<String>,
    pub direction_id: Option<i16>,
    pub block_id: Option<String>,
    pub shape_id: Option<String>,
    pub wheelchair_accessible: Option<WheelchairAccessible>,
    pub bikes_allowed: Option<BikesAllowed>,
}

/// Accessibility of a trip for wheelchairs.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Hash, Clone, Copy)]
pub enum WheelchairAccessible {
    #[serde(rename = "0")]
    NoInformation,
    #[serde(rename = "1")]
    Accessible,
    #[serde(rename = "2")]
    NotAccessible,
}

/// Bike allowance for a trip.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Hash, Clone, Copy)]
pub enum BikesAllowed {
    #[serde(rename = "0")]
    NoInformation,
    #[serde(rename = "1")]
    Allowed,
    #[serde(rename = "2")]
    NotAllowed,
}

/// Scheduled stop time for a trip. 
/// https://gtfs.org/documentation/schedule/reference/#stop_timestxt
#[derive(Debug, Serialize, Deserialize)]
pub struct StopTime {
    pub trip_id: String,
    pub arrival_time: Option<String>,
    pub departure_time: Option<String>,
    pub stop_id: String,
    pub stop_sequence: i32,
    pub stop_headsign: Option<String>,
    pub pickup_type: Option<PickupDropoffType>,
    pub drop_off_type: Option<PickupDropoffType>,
    pub continuous_pickup: Option<ContinuousPickupDropoff>,
    pub continuous_drop_off: Option<ContinuousPickupDropoff>,
    pub shape_dist_traveled: Option<f64>,
    pub timepoint: Option<Timepoint>,
}

/// Pickup or drop-off type for a stop.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Hash, Clone, Copy)]
pub enum PickupDropoffType {
    #[serde(rename = "0")]
    Regular,
    #[serde(rename = "1")]
    NoPickupDropoff,
    #[serde(rename = "2")]
    PhoneAgency,
    #[serde(rename = "3")]
    CoordinateWithDriver,
}

/// Continuous pickup or drop-off type for a route.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Hash, Clone, Copy)]
pub enum ContinuousPickupDropoff {
    #[serde(rename = "0")]
    Continuous,
    #[serde(rename = "1")]
    NoContinuous,
    #[serde(rename = "2")]
    PhoneAgency,
    #[serde(rename = "3")]
    CoordinateWithDriver,
}

/// Whether time is a precise point or an estimate.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Hash, Clone, Copy)]
pub enum Timepoint {
    #[serde(rename = "0")]
    Approximate,
    #[serde(rename = "1")]
    Exact,
}

/// Weekly schedule of service. 
/// https://gtfs.org/documentation/schedule/reference/#calendartxt
#[derive(Debug, Serialize, Deserialize)]
pub struct Calendar {
    pub service_id: String,
    pub monday: i16,
    pub tuesday: i16,
    pub wednesday: i16,
    pub thursday: i16,
    pub friday: i16,
    pub saturday: i16,
    pub sunday: i16,
    pub start_date: String,
    pub end_date: String,
}

/// Exceptions for the schedule of a service. 
/// https://gtfs.org/documentation/schedule/reference/#calendar_datestxt
#[derive(Debug, Serialize, Deserialize)]
pub struct CalendarDate {
    pub service_id: String,
    pub date: String,
    pub exception_type: ExceptionType,
}

/// Type of schedule exception.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Hash, Clone, Copy)]
pub enum ExceptionType {
    #[serde(rename = "1")]
    Added,
    #[serde(rename = "2")]
    Removed,
}

/// Represents a level in a station. 
/// https://gtfs.org/documentation/schedule/reference/#levelstxt
#[derive(Debug, Serialize, Deserialize)]
pub struct Level {
    pub level_id: String,
    pub level_index: f64,
    pub level_name: Option<String>,
}


/// Shape points that define the path of a route. 
/// https://gtfs.org/documentation/schedule/reference/#shapestxt
#[derive(Debug, Serialize, Deserialize)]
pub struct Shape {
    pub shape_id: String,
    pub shape_pt_lat: f64,
    pub shape_pt_lon: f64,
    pub shape_pt_sequence: i32,
    pub shape_dist_traveled: Option<f64>,
}

/// Fare information for a route. 
/// https://gtfs.org/documentation/schedule/reference/#fare_attributestxt
#[derive(Debug, Serialize, Deserialize)]
pub struct FareAttribute {
    pub fare_id: String,
    pub price: f64,
    pub currency_type: String,
    pub payment_method: PaymentMethod,
    pub transfers: Option<Transfers>,
    pub agency_id: Option<String>,
    pub transfer_duration: Option<i64>,
}

/// Payment method for a fare.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Hash, Clone, Copy)]
pub enum PaymentMethod {
    #[serde(rename = "0")]
    OnBoard,
    #[serde(rename = "1")]
    PreBoard,
}

/// Number of transfers allowed with a fare.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Hash, Clone, Copy)]
pub enum Transfers {
    #[serde(rename = "0")]
    NoTransfers,
    #[serde(rename = "1")]
    OneTransfer,
    #[serde(rename = "2")]
    TwoTransfers,
    #[serde(rename = "unlimited")]
    UnlimitedTransfers,
}

/// Rules that define the application of fares to routes or zones. 
/// https://gtfs.org/documentation/schedule/reference/#fare_rulestxt
#[derive(Debug, Serialize, Deserialize)]
pub struct FareRule {
    pub fare_id: String,
    pub route_id: Option<String>,
    pub origin_id: Option<String>,
    pub destination_id: Option<String>,
    pub contains_id: Option<String>,
}

/// Defines frequency-based service for a trip. 
/// https://gtfs.org/documentation/schedule/reference/#frequenciestxt
#[derive(Debug, Serialize, Deserialize)]
pub struct Frequency {
    pub trip_id: String,
    pub start_time: String,
    pub end_time: String,
    pub headway_secs: i64,
    pub exact_times: Option<ExactTimes>,
}

/// Specifies whether exact times are used for a frequency.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Hash, Clone, Copy)]
pub enum ExactTimes {
    #[serde(rename = "0")]
    FrequencyBased,
    #[serde(rename = "1")]
    ScheduleBased,
}

/// Rules for making connections at transfer points between routes. 
/// https://gtfs.org/documentation/schedule/reference/#transferstxt
#[derive(Debug, Serialize, Deserialize)]
pub struct Transfer {
    pub from_stop_id: String,
    pub to_stop_id: String,
    pub transfer_type: TransferType,
    pub min_transfer_time: Option<i64>,
}

/// Type of transfer between stops.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Hash, Clone, Copy)]
pub enum TransferType {
    #[serde(rename = "0")]
    Recommended,
    #[serde(rename = "1")]
    Timed,
    #[serde(rename = "2")]
    MinimumTime,
    #[serde(rename = "3")]
    NotPossible,
}

/// Pathways within stations to guide passengers between locations. 
/// https://gtfs.org/documentation/schedule/reference/#pathwaystxt
#[derive(Debug, Serialize, Deserialize)]
pub struct Pathway {
    pub pathway_id: String,
    pub from_stop_id: String,
    pub to_stop_id: String,
    pub pathway_mode: PathwayMode,
    pub is_bidirectional: Directionality,
    pub length: Option<f64>,
    pub traversal_time: Option<i64>,
    pub stair_count: Option<i32>,
    pub max_slope: Option<f64>,
    pub min_width: Option<f64>,
    pub signposted_as: Option<String>,
    pub reversed_signposted_as: Option<String>,
}

/// Type of pathway within a station.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Hash, Clone, Copy)]
pub enum PathwayMode {
    #[serde(rename = "1")]
    Walkway,
    #[serde(rename = "2")]
    Stairs,
    #[serde(rename = "3")]
    MovingSidewalk,
    #[serde(rename = "4")]
    Escalator,
    #[serde(rename = "5")]
    Elevator,
    #[serde(rename = "6")]
    FareGate,
    #[serde(rename = "7")]
    ExitGate,
}

/// Directionality of a pathway.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Hash, Clone, Copy)]
pub enum Directionality {
    #[serde(rename = "0")]
    Unidirectional,
    #[serde(rename = "1")]
    Bidirectional,
}

/// Translations for customer-facing dataset fields. 
/// https://gtfs.org/documentation/schedule/reference/#translationstxt
#[derive(Debug, Serialize, Deserialize)]
pub struct Translation {
    pub table_name: String,
    pub field_name: String,
    pub language: String,
    pub translation: String,
    pub record_id: Option<String>,
    pub record_sub_id: Option<String>,
    pub field_value: Option<String>,
}

/// Metadata about the feed, including version and publisher information. 
/// https://gtfs.org/documentation/schedule/reference/#feed_infotxt
#[derive(Debug, Serialize, Deserialize)]
pub struct FeedInfo {
    pub feed_publisher_name: String,
    pub feed_publisher_url: String,
    pub feed_lang: String,
    pub default_lang: Option<String>,
    pub feed_start_date: Option<String>,
    pub feed_end_date: Option<String>,
    pub feed_version: Option<String>,
    pub feed_contact_email: Option<String>,
    pub feed_contact_url: Option<String>,
}
