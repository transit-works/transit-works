use crate::gtfs::error::Error;
use crate::gtfs::raw_gtfs::*;

use std::convert::TryFrom;
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Default)]
pub struct Gtfs {
    /// Calendar by `service_id`
    pub calendar: HashMap<String, Calendar>,
    /// Calendar dates by `service_id`
    pub calendar_dates: HashMap<String, Vec<CalendarDate>>,
    /// Stops by `stop_id`
    pub stops: HashMap<String, Arc<Stop>>,
    /// Routes by `route_id`
    pub routes: HashMap<String, Route>,
    /// All trips by `trip_id`
    pub trips: HashMap<String, Trip>,
    /// All agencies
    pub agencies: Vec<Agency>,
    /// All shapes by `shape_id`
    pub shapes: HashMap<String, Vec<Shape>>,
    /// All fare attributes by `fare_id`
    pub fare_attributes: HashMap<String, FareAttribute>,
    /// All fare rules by `fare_id`
    pub fare_rules: HashMap<String, Vec<FareRule>>,
    /// All feed info
    pub feed_info: Vec<FeedInfo>,
}

impl Gtfs {
    pub fn print_stats(&self) {
        println!("GTFS data:");
        println!("  Calendar: {}", self.calendar.len());
        println!("  Calendar dates: {}", self.calendar_dates.len());
        println!("  Stops: {}", self.stops.len());
        println!("  Routes: {}", self.routes.len());
        println!("  Trips: {}", self.trips.len());
        println!("  Agencies: {}", self.agencies.len());
        println!("  Shapes: {}", self.shapes.len());
        println!("  Fare attributes: {}", self.fare_attributes.len());
        println!("  Fare rules: {}", self.fare_rules.len());
        println!("  Feed info: {}", self.feed_info.len());
    }

    pub fn from_path<P>(path: P) -> Result<Gtfs, Error>
    where
        P: AsRef<std::path::Path>,
    {
        GtfsDataSet::from_path(path).and_then(Gtfs::try_from)
    }
}

impl TryFrom<GtfsDataSet> for Gtfs {
    type Error = Error;
    /// Tries to build a [Gtfs] from a [GtfsDataSet]
    fn try_from(raw: GtfsDataSet) -> Result<Gtfs, Error> {
        let stops = to_stop_map(
            raw.stops?, 
            raw.transfers.unwrap_or_else(|| Ok(Vec::new()))?, 
            raw.pathways.unwrap_or_else(|| Ok(Vec::new()))?,
        )?;
        let trips = to_trips_map(
            raw.trips?, 
            raw.stop_times?, 
            raw.frequencies.unwrap_or_else(|| Ok(Vec::new()))?, 
            &stops,
        )?;
        let mut fare_rules = HashMap::<String, Vec<FareRule>>::new();
        for f in raw.fare_rules.unwrap_or_else(|| Ok(Vec::new()))? {
            (*fare_rules.entry(f.fare_id.clone()).or_default()).push(f);
        }
        Ok(Gtfs {
            stops: stops,
            routes: to_map(raw.routes?),
            trips: trips,
            agencies: raw.agencies?,
            shapes: to_shape_map(raw.shapes.unwrap_or_else(|| Ok(Vec::new()))?),
            fare_attributes: to_map(raw.fare_attributes.unwrap_or_else(|| Ok(Vec::new()))?),
            fare_rules: fare_rules,
            feed_info: raw.feed_info.unwrap_or_else(|| Ok(Vec::new()))?,
            calendar: to_map(raw.calendar.unwrap_or_else(|| Ok(Vec::new()))?),
            calendar_dates: to_calendar_dates(
                raw.calendar_dates.unwrap_or_else(|| Ok(Vec::new()))?,
            ),
        })
    }
}

fn to_map<O: Id>(elements: impl IntoIterator<Item = O>) -> HashMap<String, O> {
    elements
        .into_iter()
        .map(|e| (e.id().to_owned(), e))
        .collect()
}

fn to_stop_map(
    stops: Vec<Stop>,
    transfers: Vec<Transfer>,
    pathways: Vec<Pathway>,
) -> Result<HashMap<String, Arc<Stop>>, Error> {
    let mut stop_map: HashMap<String, Stop> = 
        stops.into_iter().map(|s| (s.stop_id.clone(), s)).collect();

    for transfer in transfers {
        stop_map.get(&transfer.to_stop_id).ok_or_else(|| {
            let stop_id = &transfer.to_stop_id;
            Error::ReferenceError(format!("'{stop_id}' in transfers.txt"))
        })?;
        stop_map
            .entry(transfer.from_stop_id.clone())
            .and_modify(|s| s.transfers.push(transfer));
    }

    for pathway in pathways {
        stop_map.get(&pathway.to_stop_id).ok_or_else(|| {
            let stop_id = &pathway.to_stop_id;
            Error::ReferenceError(format!("'{stop_id}' in pathways.txt"))
        })?;
        stop_map
            .entry(pathway.from_stop_id.clone())
            .and_modify(|s| s.pathways.push(pathway));
    }

    Ok(stop_map
        .into_iter()
        .map(|(i, s)| (i, Arc::new(s)))
        .collect())
}

fn to_shape_map(shapes: Vec<Shape>) -> HashMap<String, Vec<Shape>> {
    let mut res = HashMap::default();
    for s in shapes {
        let shape = 
            res
                .entry(s.shape_id.to_owned())
                .or_insert_with(Vec::new);
        shape.push(s);
    }
    for shapes in res.values_mut() {
        shapes.sort_by_key(|s| s.shape_pt_sequence);
    }
    res
}

const NB_STOP_TIMES_BEFORE_SHRINK: usize = 1_000_000;

fn to_trips_map(
    raw_trips: Vec<Trip>,
    mut stop_times: Vec<StopTime>,
    frequencies: Vec<Frequency>,
    stops: &HashMap<String, Arc<Stop>>,
) -> Result<HashMap<String, Trip>, Error> {
    let mut trips = to_map(raw_trips);

    let mut st_idx = 0;
    while let Some(mut s) = stop_times.pop() {
        st_idx += 1;
        let trip = &mut trips
            .get_mut(&s.trip_id)
            .ok_or_else(|| Error::ReferenceError(s.trip_id.to_string()))?;
        let stop = stops
            .get(&s.stop_id)
            .ok_or_else(|| Error::ReferenceError(s.stop_id.to_string()))?;
        s.stop = stop.clone();
        trip.stop_times.push(s);
        if st_idx % NB_STOP_TIMES_BEFORE_SHRINK == 0 {
            stop_times.shrink_to_fit();
        }
    }

    for trip in &mut trips.values_mut() {
        trip.stop_times
            .sort_by(|a, b| a.stop_sequence.cmp(&b.stop_sequence));
    }

    for f in frequencies {
        let trip = &mut trips
            .get_mut(&f.trip_id)
            .ok_or_else(|| Error::ReferenceError(f.trip_id.to_string()))?;
        trip.frequencies.push(f);
    }

    Ok(trips)
}

fn to_calendar_dates(cd: Vec<CalendarDate>) -> HashMap<String, Vec<CalendarDate>> {
    let mut res = HashMap::default();
    for c in cd {
        let cal = res.entry(c.service_id.to_owned()).or_insert_with(Vec::new);
        cal.push(c);
    }
    res
}
