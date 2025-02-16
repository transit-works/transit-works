use crate::gtfs::error::Error;
use crate::gtfs::raw_gtfs::GtfsDataSet;
use crate::gtfs::structs::*;

use std::collections::HashMap;
use std::convert::TryFrom;
use std::sync::Arc;

use serde::{Deserialize, Deserializer, Serialize, Serializer};

#[derive(Default, Clone)]
pub struct Gtfs {
    /// Calendar by `service_id`
    pub calendar: HashMap<String, Calendar>,
    /// Calendar dates by `service_id`
    pub calendar_dates: HashMap<String, Vec<CalendarDate>>,
    /// Stops by `stop_id`
    pub stops: HashMap<String, Arc<Stop>>,
    /// Routes by `route_id`
    pub routes: HashMap<String, Route>,
    /// All trips by `route_id`
    pub trips: HashMap<String, Vec<Trip>>,
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

impl Serialize for Gtfs {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let gtfs_dataset: GtfsDataSet = (*self).clone().try_into().map_err(serde::ser::Error::custom)?;
        gtfs_dataset.serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for Gtfs {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let gtfs_dataset = GtfsDataSet::deserialize(deserializer)?;
        Gtfs::try_from(gtfs_dataset).map_err(serde::de::Error::custom)
    }
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
        let route_to_trips = trips.values().fold(HashMap::new(), |mut acc, t| {
            acc.entry(t.route_id.clone())
                .or_insert_with(Vec::new)
                .push(t.clone());
            acc
        });
        Ok(Gtfs {
            stops: stops,
            routes: to_map(raw.routes?),
            trips: route_to_trips,
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

impl TryInto<GtfsDataSet> for Gtfs {
    type Error = Error;
    /// Tries to convert a [Gtfs] into a [GtfsDataSet]
    fn try_into(self) -> Result<GtfsDataSet, Error> {
        // Reconstruct stops and extract transfers and pathways from each stop.
        let mut raw_transfers = Vec::new();
        let mut raw_pathways = Vec::new();
        let raw_stops: Vec<Stop> = self.stops
            .into_values()
            .map(|arc_stop| {
                // Clone the stop since the Arc is referenced in many places.
                let mut stop = (*arc_stop).clone();
                raw_transfers.extend(stop.transfers.drain(0..));
                raw_pathways.extend(stop.pathways.drain(0..));
                stop
            })
            .collect();

        // Extract trips along with their stop_times and frequencies.
        let mut raw_stop_times = Vec::new();
        let mut raw_frequencies = Vec::new();
        let mut raw_trips = Vec::new();
        for trip_list in self.trips.into_values() {
            for mut trip in trip_list {
                raw_stop_times.append(&mut trip.stop_times);
                raw_frequencies.append(&mut trip.frequencies);
                raw_trips.push(trip);
            }
        }

        // Flatten other fields from maps.
        let raw_routes: Vec<Route> = self.routes.into_values().collect();
        let raw_shapes: Vec<Shape> = self.shapes.into_values().flatten().collect();
        let raw_fare_attributes: Vec<FareAttribute> = self.fare_attributes.into_values().collect();
        let raw_fare_rules: Vec<FareRule> = self.fare_rules.into_values().flatten().collect();
        let raw_calendar: Vec<Calendar> = self.calendar.into_values().collect();
        let raw_calendar_dates: Vec<CalendarDate> = self.calendar_dates.into_values().flatten().collect();

        Ok(GtfsDataSet {
            agencies: Ok(self.agencies),
            stops: Ok(raw_stops),
            routes: Ok(raw_routes),
            trips: Ok(raw_trips),
            stop_times: Ok(raw_stop_times),
            calendar: Some(Ok(raw_calendar)),
            calendar_dates: Some(Ok(raw_calendar_dates)),
            shapes: Some(Ok(raw_shapes)),
            fare_attributes: Some(Ok(raw_fare_attributes)),
            fare_rules: Some(Ok(raw_fare_rules)),
            frequencies: Some(Ok(raw_frequencies)),
            transfers: Some(Ok(raw_transfers)),
            pathways: Some(Ok(raw_pathways)),
            feed_info: Some(Ok(self.feed_info)),
            translations: None, // optional field not present
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
        let shape = res.entry(s.shape_id.to_owned()).or_insert_with(Vec::new);
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
