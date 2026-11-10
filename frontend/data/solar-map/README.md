# Solar map boundary data

The map uses simplified GeoJSON boundary snapshots for South Africa's nine provinces and 213 local municipalities. Municipality boundaries are split into one file per province and loaded only after that province is opened. A small name-and-coordinate index supports municipality search without loading every boundary.

Boundary source: geoBoundaries Open license, based on OCHA ROSEA and South Africa's Municipal Demarcation Board. The source metadata identifies the boundaries as representing 2020, built on 12 December 2023 from source data updated on 19 January 2023. The dataset license is CC BY 3.0 IGO. The province label "Nothern Cape" in the source feature name is normalized to the official spelling "Northern Cape"; the source geometry and IDs are unchanged. Metadata and attribution: [`metadata.json`](./metadata.json).

The source is not a current ward or cadastral dataset. Town, suburb, and ward boundaries are not included. Representative points are calculated from each area's geometry for clearly labeled point-model estimates; they are not area-wide averages.

## Attribution

Boundary data: geoBoundaries, OCHA ROSEA, and the South African Municipal Demarcation Board, South Africa ADM1/ADM3 (2020), CC BY 3.0 IGO. See [geoBoundaries](https://www.geoboundaries.org/) and [the source dataset](https://data.humdata.org/dataset/south-africa-admin-level-1-boundaries).
