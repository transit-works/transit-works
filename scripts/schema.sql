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
    geom POLYGON,
    population REAL,
    attraction_morning REAL,
    attraction_am_rush REAL,
    attraction_mid_day REAL,
    attraction_pm_rush REAL,
    attraction_evening REAL,
    production_morning REAL,
    production_am_rush REAL,
    production_mid_day REAL,
    production_pm_rush REAL,
    production_evening REAL
);

CREATE TABLE demand (
    origid INTEGER,
    destid INTEGER,
    dist_km REAL,
    volume REAL,
    volume_morning REAL,
    volume_am_rush REAL,
    volume_mid_day REAL,
    volume_pm_rush REAL,
    volume_evening REAL,
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
    agency_fare_url TEXT, 
    agency_email TEXT
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
    wheelchair_boarding TEXT, 
    platform_code TEXT
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
    route_text_color TEXT, 
    route_sort_order TEXT,
    continuous_pickup TEXT, 
    continuous_drop_off TEXT, 
    network_id TEXT
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

CREATE TABLE gtfs_stop_times (
    trip_id TEXT, 
    arrival_time TEXT, 
    departure_time TEXT, 
    stop_id TEXT, 
    stop_sequence TEXT, 
    stop_headsign TEXT, 
    pickup_type TEXT, 
    drop_off_type TEXT, 
    continuous_pickup TEXT, 
    continuous_drop_off TEXT, 
    shape_dist_traveled TEXT, 
    timepoint TEXT
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

CREATE TABLE gtfs_fare_attributes (
    fare_id TEXT, 
    price TEXT, 
    currency_type TEXT, 
    payment_method TEXT, 
    transfers TEXT, 
    agency_id TEXT, 
    transfer_duration TEXT
);

CREATE TABLE gtfs_fare_rules (
    fare_id TEXT, 
    route_id TEXT, 
    origin_id TEXT, 
    destination_id TEXT, 
    contains_id TEXT
);

CREATE TABLE gtfs_shapes (
    shape_id TEXT, 
    shape_pt_lat TEXT, 
    shape_pt_lon TEXT, 
    shape_pt_sequence TEXT, 
    shape_dist_traveled TEXT
);

CREATE TABLE gtfs_frequencies (
    trip_id TEXT, 
    start_time TEXT, 
    end_time TEXT, 
    headway_secs TEXT, 
    exact_times TEXT
);

CREATE TABLE gtfs_transfers (
    from_stop_id TEXT, 
    to_stop_id TEXT, 
    transfer_type TEXT, 
    min_transfer_time TEXT
);

CREATE TABLE gtfs_pathways (
    pathway_id TEXT, 
    from_stop_id TEXT, 
    to_stop_id TEXT, 
    pathway_mode TEXT, 
    is_bidirectional TEXT, 
    length TEXT, 
    traversal_time TEXT, 
    stair_count TEXT, 
    max_slope TEXT, 
    min_width TEXT, 
    signposted_as TEXT, 
    reversed_signposted_as TEXT
);

CREATE TABLE gtfs_levels (
    level_id TEXT, 
    level_index TEXT, 
    level_name TEXT
);

CREATE TABLE gtfs_location_groups (
    location_group_id TEXT, 
    location_group_name TEXT
);

CREATE TABLE gtfs_location_group_stops (
    location_group_id TEXT, 
    stop_id TEXT
);

CREATE TABLE gtfs_booking_rules (
    booking_rule_id TEXT, 
    booking_type TEXT, 
    prior_notice_duration TEXT, 
    prior_notice_start TEXT, 
    prior_notice_end TEXT, 
    prior_notice_exact_time TEXT, 
    latest_booking_time TEXT, 
    minimum_booking_time TEXT, 
    maximum_booking_time TEXT
);

CREATE TABLE gtfs_translations (
    table_name TEXT, 
    field_name TEXT, 
    language TEXT, 
    translation TEXT, 
    record_id TEXT, 
    field_value TEXT
);

CREATE TABLE gtfs_feed_info (
    feed_publisher_name TEXT, 
    feed_publisher_url TEXT, 
    feed_lang TEXT, 
    feed_start_date TEXT, 
    feed_end_date TEXT, 
    feed_version TEXT, 
    feed_contact_email TEXT, 
    feed_contact_url TEXT
);

CREATE TABLE gtfs_attributions (
    attribution_id TEXT, 
    organization_name TEXT, 
    is_producer TEXT, 
    is_operator TEXT, 
    is_authority TEXT, 
    attribution_url TEXT, 
    attribution_email TEXT, 
    attribution_phone TEXT
);
