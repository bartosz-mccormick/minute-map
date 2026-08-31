<p align="center"> <picture> <source media="(prefers-color-scheme: dark)" srcset="assets/minutemap_logo_text_dark.svg"> <source media="(prefers-color-scheme: light)" srcset="assets/minutemap_logo_text.svg"> <img src="assets/minutemap_logo_text.svg" alt="MinuteMap logo" width="180"> </picture> </p>

<p align="center"> <b><a href="https://minutemap.online">Open MinuteMap ↗</a></b>  </p>

# MinuteMap
MinuteMap is a web-GIS tool that provides decision support for X-Minute City planning through dynamic accessibility models and interactive maps.

Its core functionality is to calculate "compliance" indicators that summarize access to multiple amenities. Users can assess accessibility from different perspectives by setting travel-time and quantity thresholds to reflect planning objectives or the needs and preferences of different user groups. Interactive maps allow users to explore the results and identify areas where accessibility could be improved. 



<!-- <p align="center"> <img src="path/to/demo.gif" alt="Demo of the tool"> </p> -->

## How it works
The app uses precomputed accessibility tables to quickly calculate accessibility indicators based on user-defined thresholds. Calculations are run locally in the browser using DuckDB via WebAssembly (WASM), making it possible to analyze large planning areas efficiently.



<!-- ## Getting started 

You can access the tool via [minutemap.online](https:://minutemap.online)

### Local deployment
MinuteMap is a flexible frontend that can be configured to work with any data, allowing for custom scenarios and routing to be implemented. Detailed documentation for local deployment will be available soon. -->

<!-- - clone repository
- save a copy of `.env.example` as `.env`
- `npm run install`
- `npm run dev`

MinuteMap is supported by a core framework for preparing all input data tables. The framework works with open data, making it possible to set up the tool anywhere in the world.

- **[minute-map-accessibility-postgis](https://github.com/bartosz-mccormick/minute-map-accessibility-postgis)**: create a postgis database from OSM data, define amenities using custom rules, clean data and 
- **minute-map-accessibility-calculations**: (available soon!) -->

<!-- ### ACCESSIBILITY CALCULATIONS
- save a copy of `/r-scripts/.env.example` as `/r-scripts/.env`
- (OPTIONAL) add a GTFS file to `/r-scripts/input_data` (will be trimmed to study area)
- add a `.pbf` extract of OSM data to `/r-scripts/input_data` (can be moved from `/dreams-accessibility-postgis/data/`) (will be trimmed to study area)
- save a copy of `/r-scripts/.env.example` as `/r-scripts/.env`
  - set `TARGET_SRID` to a projected CRS that covers the city
- run `main.R` with `/r-scripts/` as the working directory -->


## Related publications
McCormick, B., Arias-Molinares, D., van Bezooijen, D., Geurs, K., Duran-Rodas, D., & Büttner, B. (2026).
The DREAMS Accessibility Modeling Framework for Decision Support in X-Minute City Planning.
DREAMS Project Deliverable 3.1. [PDF](https://dreams.mobyome.at/images/d/d8/Deliverable_3_1.pdf)

Arias Molinares, D., van Bezooijen, D., Bobičić, O., et al. (2026).
Perceived accessibility of 15-minute neighbourhoods from residents living in the urban outskirts.
DREAMS Project Deliverable 4.2. [PDF](https://dreams.mobyome.at/images/6/67/2026_06_12_Deliverable4.2_FINAL.pdf)

## Project and funding

MinuteMap was developed as part of [DREAMS](https://dreams.mobyome.at/wiki/Main_Page), an international project exploring how the 15-Minute City can be adapted for the urban outskirts. The project was funded through [Driving Urban Transitions Partnership](https://dutpartnership.eu/).


<p align="center"> <img src="assets/DREAMS-logo-transparent.png" alt="DREAMS project" height="70" align="middle">&nbsp;&nbsp;&nbsp; <img src="assets/DUT-Logo.png" alt="DUT logo" height="40" align="middle">&nbsp;&nbsp;&nbsp; <img src="assets/eu-funding.png" alt="Co-funded by the EU" height="30" align="middle"> </p>






