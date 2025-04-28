# Transit Works

Public transit networks, particularly those in North America, often suffer from underutilization due to inefficiencies like lengthy wait times and poor transit integration. Our project provides an open-source software solution that leverages public data and meta-heuristic algorithms to improve existing transit networks while still maintaining operational feasibility. Networks are optimized incrementally to reduce transfers, minimize trip times, and increase coverage to underserved areas on the basis of origin-destination demand data, travel patterns, and other real-world constraints.

## Overview

Transit Works allows planners and transit authorities to:

- Visualize transit networks and economic utilization metrics
- Optimize existing routes based on demand and efficiency
- Export results in various formats for further analysis

## Demo
![Transit Works Demo](demo/demo.gif)

**Note:** Demo video quality significantly reduced. 

## Project Structure

```
transit-works/
├── frontend/              # Next.js web application
│   ├── public/            # Static assets
│   │   ├── data/          # City statistics and other data
│   │   └── styles/        # Map styles
│   └── src/               # React components and application logic
├── route-service/         # Rust-based service for route optimization
│   └── src/
│       └── gtfs/          # GTFS data processing
├── scripts/               # Utility scripts
│   ├── populate_db.py     # Database population script
│   └── gravity_model.py   # Travel demand modeling
├── docs/                  # Project documentation
└── README.md              
```

## Features

- **Transit & Economic Analysis**: Compare transit scores with economic indicators across cities
- **Route Optimization**: Improve existing routes using advanced algorithms
- **Data Visualization**: Interactive maps showing transport networks
- **City Comparison**: Analyze metrics across multiple cities
- **Data Export**: Export results in CSV or JSON formats

## Technologies Used

- **Frontend**: Next.js, React, Tailwind CSS
- **Mapping**: Maplibre GL, Deck.gl
- **Backend Services**: Rust
- **Data Processing**: Python
- **Data Format**: GTFS (General Transit Feed Specification)
- **Database**: SQLite

## Getting Started

### Prerequisites

- Node.js (v16+)
- Rust (latest stable)
- Python 3.8+
- SQLite database

### Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Route Service Setup (backend)

```bash
# Navigate to route-service directory
cd route-service

# Build the service
cargo build

# Run the service
cargo run
```

### Database Setup

Run this script for all cities you would like to use. See README.md in the /scripts folder to view more details.

```bash
# Create and populate the database
python scripts/populate_db.py --city <city_name>
```

## Usage

### City Analysis

The platform provides transit and economic utilization scores for various cities:

- Toronto, Canada
- Chicago, United States
- Austin, United States
- San Francisco, United States

Additional cities are being added (marked as "coming soon").

## Contributing

Contributions to Transit Works are welcome. Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
