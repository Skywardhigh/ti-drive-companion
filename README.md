# TI Drive Companion

TI Drive Companion is an unofficial, browser-based explorer for comparing
starship drives from
[Terra Invicta on Steam](https://store.steampowered.com/app/1176470/Terra_Invicta/).
It plots drive thrust against exhaust velocity and makes the game's large drive
catalog easier to search, filter, and compare.

**Live tool:** [ti-drive-companion.quitti.workers.dev](https://ti-drive-companion.quitti.workers.dev/)

## Features

- Three selectable chart modes:
  - **Drive performance:** exhaust velocity versus thrust
  - **Power demand:** required electrical power versus thrust, with a dedicated
    lane for self-powered drives
  - **Installed system:** exhaust velocity versus thrust per tonne of drive,
    automatically selected compatible power plant and chosen radiator
- Logarithmic and linear chart scales
- Search by drive name, type, or propellant
- Multi-select filters for propellants, drive families, and drive subtypes
- Color-coded technology families and subtype-specific chart markers
- Optional collision-aware drive-name labels with automatic nearby placement and
  leader lines
- Global larger, clearer text mode using a highly readable sans-serif font
- Optional filtering to show only the highest-thruster-count variant of each
  drive
- Hover details for performance, propellant type, and per-tank resource
  composition
- Side-by-side comparison of up to four drives, including required power,
  power-plant requirements, power timing, thrust rating, specific power, and
  thrust per required power
- Responsive layout for desktop and smaller screens

## Run locally

### Requirements

- [Node.js](https://nodejs.org/) 22.13 or newer
- npm, which is included with Node.js

### Development server

From the project directory, install the dependencies:

```bash
npm install
```

Start the local development server:

```bash
npm run dev
```

Open the local address printed in the terminal, normally
`http://localhost:3000`. Changes to the application source are reflected while
the development server is running.

### Production build

Create and validate a production build with:

```bash
npm run build
```

Run the production build locally with:

```bash
npm run start
```

The automated build and rendered-page check can be run together with:

```bash
npm test
```

## Using the tool

1. Search for a drive by name, classification, power-plant subtype, or
   propellant.
2. Use the propellant and drive-type dropdowns to select any combination of
   categories. Drive subtypes are grouped beneath their main technology family.
3. Keep **Max thrusters only** enabled to show only the largest configuration
   of each drive, or disable it to see every thruster-count variant.
4. **Show drive names** is enabled by default and uses collision-aware placement.
   Disable it when a cleaner marker-only view is preferred.
5. Enable **Larger, clearer text** to increase typography across the entire
   interface and use a consistent accessibility-focused sans-serif font.
6. Select **Drive performance**, **Power demand**, or **Installed system** above
   the chart. Installed-system mode automatically uses the lightest compatible
   power plant with the selected radiator. The radiator selector defaults to
   **Lithium Spray**.
7. Switch between logarithmic and linear chart scales as needed.
8. Hover over a chart marker to inspect the drive and its tank composition.
   Power and installed-system views add their relevant power, reactor,
   radiator, mass, and specific-thrust details.
9. Select chart markers or search results to compare up to four drives below
   the chart, including their complete power requirements. Zero-power drives
   are identified as self-powered and do not receive a misleading ratio.

## Game data

The browser loads three runtime datasets:

- `public/data/TIDriveTemplate.json` for drives
- `public/data/TIPowerPlantTemplate.json` for power plants and reactors
- `public/data/TIRadiatorTemplate.json` for radiators

The repository retains matching source copies under `data/`. To refresh the
catalog, replace any or all of the source files there, preserving their exact
filenames, and run:

```bash
npm run sync-data
```

The command validates that each file is non-empty JSON, checks the fields used
by the tool and duplicate `dataName` values, then copies all three datasets to
`public/data/`. All three files are validated before anything is copied, so a`nvalidation failure leaves the runtime datasets unchanged.
Run `npm test` afterward before committing or deploying an update.

Together, the datasets include drive performance and classifications,
power-plant compatibility and capacity, reactor efficiency and specific power,
radiator heat rejection and mass characteristics, propellant categories, and
per-tank Terra Invicta resource compositions. Disabled drive configurations are
excluded from the chart.

## Terra Invicta attribution

Terra Invicta is developed by
[Pavonis Interactive](https://www.pavonisinteractive.com/) and published by
[Hooded Horse](https://www.hoodedhorse.com/). This project is an unofficial
community tool and is not affiliated with, endorsed by, or sponsored by Pavonis
Interactive or Hooded Horse.

All Terra Invicta drive, power-plant/reactor, and radiator data—including the
contents of `TIDriveTemplate.json`, `TIPowerPlantTemplate.json`, and
`TIRadiatorTemplate.json`—as well as names, classifications, game terminology,
and other game-derived content belong to their respective rights holders,
including Pavonis Interactive and Hooded Horse.

## Development note

A major part of this tool's design and implementation was created with
OpenAI Codex using GPT-5.6, guided by human-provided requirements, feedback,
and review.

## License

The TI Drive Companion tool source code is available under the
[MIT License](LICENSE).

**The MIT License applies only to the tool's original source code. It does not
apply to the included Terra Invicta drive, power-plant/reactor, or radiator
datasets, or any other game-derived names, data, terminology, or content.**
Those materials remain the property of their respective rights holders and are
included here only for use by this unofficial comparison tool.
