# India states outline

`india-states.json` — India's states and union territories (36, incl. Ladakh and Dadra and Nagar Haveli and Daman and
Diu), drawn with India's official boundaries. Used by the Reports state map (`src/components/reports/indiaMap.ts`).

- Source: [DataMeet India — States (Admin2)](https://github.com/datameet/maps/tree/master/States) by the
  [DataMeet India community](http://datameet.org/), licence [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Changed: simplified with mapshaper 0.6 (`-filter-fields ST_NM -simplify 0.7% keep-shapes`, precision 0.001°) and
  converted from the shapefile to GeoJSON. Only the state name (`ST_NM`) is kept.
