# Routing

To efficiently evaluate and iterate on transit routes, the pattern used to 
access data such as travel demand, road networks, census data, etc is extremely 
important. The data for a particular city is organized into 3 logical layers.

## Layer 1 - Grid Layers

The base layer is the composition of serveral grids that store data about 
regions of a city. For example, travel demand data is represented in a square-
based grid pattern with a certain volume representing the demand between any two
grids. Furthermore, Census information may be divided into polygonal divisions 
of the city storing demographic information. Our algorithm will need to 
efficiently retrieve the bounding census blocks or Origin-Destination matrix 
cells for an arbritrary coordinate. 

## Layer 2 - Road Network

The second, and perhaps obvious, layer is the road network of a city, where 
intersections are nodes and the roads between them are edges. This information 
is stored in a directed graph to facilitate efficient routing. Our algorithm may 
also want to efficiently query for all nodes (intersections) in a given area, to 
determine candidates for the next bus stop in a new route.

## Layer 3 - Bus Network

The final later is the bus network. It is important to note that the previous 
two layers are immutable -- that is, once read from the database the roads or 
grid data is never modified meaning read throuput is the top priority. However, 
in the case of the bus network, this data is frequently mutated by our 
optimization algorithms meaning that it is important to consider write 
throughput and concurrency control. 

The bus network is represented as a list of routes. A given route is described 
by a list of intersections from the road network, and a schedule describing the 
location of bus stops and frequency. The representation is designed to be as 
lightweight as possible for copying and mutations. When the bus network layer 
is converted back to GTFS, the shape and other more complex attribues can be 
determined. 
