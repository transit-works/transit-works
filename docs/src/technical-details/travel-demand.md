# Travel Demand

To effectively evaluate and plan transit routes, accurate travel demand data is very important. Travel demand data can come from 
historical data collection or effective modeling and describes the volume of trips between areas of a city and the expected modes 
of transportation for that trip.

## Data Sources

### Grid2Demand

Grid2Demand is a tool from ASU generating zone-to-zone travel demand using OSM as input https://github.com/asu-trans-ai-lab/grid2demand. 
It uses a traditional 4-step transportation forecasting model to estimate the travel demand. This data set will be compatible with the 
application and is the default data source. 

### Census Data

More accurate travel demand data can be derived using simple models on census data. The plan is to eventually support importing census data 
from the US Census and Statistics Canada for cities in the US and Canada respectively and run custom activity modeling on that data. 
