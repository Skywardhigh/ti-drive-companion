# TI Drive Companion

TI Drive Companion is an unofficial, browser-based explorer for comparing
starship drives from
[Terra Invicta on Steam](https://store.steampowered.com/app/1176470/Terra_Invicta/).
It plots drive thrust against exhaust velocity and makes the game's large drive
catalog easier to search, filter, and compare.

## Features

- Interactive thrust-versus-exhaust-velocity chart
- Logarithmic and linear chart scales
- Search by drive name, type, or propellant
- Multi-select filters for propellants, drive families, and drive subtypes
- Color-coded technology families and subtype-specific chart markers
- Optional filtering to show only the highest-thruster-count variant of each
  drive
- Hover details for performance, propellant type, and per-tank resource
  composition
- Side-by-side comparison of up to four drives
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
4. Switch between logarithmic and linear chart scales as needed.
5. Hover over a chart marker to inspect the drive and its tank composition.
6. Select chart markers or search results to compare up to four drives below
   the chart.

## Drive data

The browser loads its runtime dataset from
`public/data/TIDriveTemplate.json`. The repository also retains the source copy
at `data/TIDriveTemplate.json`. When refreshing the catalog, keep both files in
sync.

The current dataset includes drive performance, classifications, required
power-plant types, propellant categories, and per-tank Terra Invicta resource
compositions. Disabled configurations are excluded from the chart.

## Terra Invicta attribution

Terra Invicta is developed by
[Pavonis Interactive](https://www.pavonisinteractive.com/) and published by
[Hooded Horse](https://www.hoodedhorse.com/). This project is an unofficial
community tool and is not affiliated with, endorsed by, or sponsored by Pavonis
Interactive or Hooded Horse.

All Terra Invicta engine data, drive names, classifications, game terminology,
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
apply to the included Terra Invicta engine dataset or any other game-derived
names, data, terminology, or content.** Those materials remain the property of
their respective rights holders and are included here only for use by this
unofficial comparison tool.
