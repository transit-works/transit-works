# Scripts

A collection of utility scripts to do things like setting up dev environments and populate dbs.

1. [populate_db.py](#populate_db.py)

## populate_db.py

Populates a spatialite database with geospatial data for a the street network of a given city. Running this script is a prerequisite for using `route-service`.

### Prerequisites
- Sqlite3
```
brew install sqlite
```
- Spatialite
```
brew install libspatialite
```

### Required pip modules
- sqlite3
- osmnx
- grid2demand
- osm2gmns
- pandas

### Running

Python 3.11 is required.

Install if you have homebrew:
```
brew install python@3.11
python3.11 -m pip install osmnx
python3.11 -m pip install grid2demand
python3.11 -m pip install osm2gmns
python3.11 -m pip install pandas
```

And run using:
```
python3.11 populate_db.py
```
