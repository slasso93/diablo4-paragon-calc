# diablo4-paragon-calc
Takes maxroll planner containing multiple profiles and outputs damage calculations of your paragon profiles. This will take all your paragon nodes and apply the damage bucket formula `main stat*vulnerable*crit damage*additive damage`. 
It currently ignores global multipliers for glyphs. This also ignores any gear modifiers currently and is solely a tool to help compare paragon setups. 


## Assumptions:
- 100% uptime on crowd control
- sorc only at the moment
- ignores crackling energy damage
- specific skill damage will be applied (ex: Destruction crit) if skillType is set accordingly
- `critChance` is a hardcoded crit chance value

## Usage
- Paste your build link into index.js `buildLink` variable. (This is a work in progress and ideally this would be an NPM library that a UI component can use on demand)
- Modify `damageType` and `skillType`
- download and install NPM
- Run `npm install` command
- To run: `npm run start`
- results will be printed in JSON form and a "best" profile will be picked (if you have more than one profile)
