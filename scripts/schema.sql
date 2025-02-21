-- Load mod_spatialite for geometry types
-- SELECT load_extension("mod_spatialite");
-- SELECT InitSpatialMetaData(1);

-- Nodes and edges for road network data
CREATE TABLE nodes (
    fid INTEGER PRIMARY KEY,
    geom POINT,
    osmid INTEGER,
    y REAL,
    x REAL
);

CREATE TABLE edges (
    fid INTEGER PRIMARY KEY,
    geom LINESTRING,
    u INTEGER,
    v INTEGER,
    key INTEGER,
    osmid INTEGER
);

-- Zones and demand for OD matrix data
CREATE TABLE zone (
    zoneid INTEGER PRIMARY KEY,
    center POINT,
    geom POLYGON
);

CREATE TABLE demand (
    origid INTEGER,
    destid INTEGER,
    dist_km REAL,
    volume REAL,
    volume_morning REAL,
    volume_am_rush REAL,
    volume_midday REAL,
    volume_pm_rush REAL,
    volume_night REAL,
    FOREIGN KEY(origid) REFERENCES zone(zoneid),
    FOREIGN KEY(destid) REFERENCES zone(zoneid)
);

-- Tables for GTFS data
-- All columns are TEXT to match the CSV source data
CREATE TABLE gtfs_agency (
    agency_id TEXT, 
    agency_name TEXT, 
    agency_url TEXT, 
    agency_timezone TEXT, 
    agency_lang TEXT, 
    agency_phone TEXT, 
    agency_fare_url TEXT
);

CREATE TABLE gtfs_calendar (
    service_id TEXT, 
    monday TEXT, 
    tuesday TEXT, 
    wednesday TEXT, 
    thursday TEXT, 
    friday TEXT, 
    saturday TEXT, 
    sunday TEXT, 
    start_date TEXT, 
    end_date TEXT
);

CREATE TABLE gtfs_calendar_dates (
    service_id TEXT, 
    date TEXT, 
    exception_type TEXT
);

CREATE TABLE gtfs_routes (
    route_id TEXT, 
    agency_id TEXT, 
    route_short_name TEXT, 
    route_long_name TEXT, 
    route_desc TEXT, 
    route_type TEXT, 
    route_url TEXT, 
    route_color TEXT, 
    route_text_color TEXT
);

CREATE TABLE gtfs_shapes (
    shape_id TEXT, 
    shape_pt_lat TEXT, 
    shape_pt_lon TEXT, 
    shape_pt_sequence TEXT, 
    shape_dist_traveled TEXT
);

CREATE TABLE gtfs_stop_times (
    trip_id TEXT, 
    arrival_time TEXT, 
    departure_time TEXT, 
    stop_id TEXT, 
    stop_sequence TEXT, 
    stop_headsign TEXT, 
    pickup_type TEXT, 
    drop_off_type TEXT, 
    shape_dist_traveled TEXT
);

CREATE TABLE gtfs_stops (
    stop_id TEXT, 
    stop_code TEXT, 
    stop_name TEXT, 
    stop_desc TEXT, 
    stop_lat TEXT, 
    stop_lon TEXT, 
    zone_id TEXT, 
    stop_url TEXT, 
    location_type TEXT, 
    parent_station TEXT, 
    stop_timezone TEXT, 
    wheelchair_boarding TEXT
);

CREATE TABLE gtfs_trips (
    route_id TEXT, 
    service_id TEXT, 
    trip_id TEXT, 
    trip_headsign TEXT, 
    trip_short_name TEXT, 
    direction_id TEXT, 
    block_id TEXT, 
    shape_id TEXT, 
    wheelchair_accessible TEXT, 
    bikes_allowed TEXT
);
