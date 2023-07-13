import axios from 'axios';
import fs from 'fs';
import stats from './base_stats.js';
import Big from 'big.js';
import { json2csv } from 'json-2-csv';

const testName = 'conj';
const buildLink = 'https://maxroll.gg/d4/planner/6x6e0o4d'; // arc lash
//const buildLink = 'https://maxroll.gg/d4/planner/uz2w0zot'; // ice shard
//const buildLink = 'https://maxroll.gg/d4/planner/vx640zvd'; // v4v compare
//const buildLink = 'https://maxroll.gg/d4/planner/a4710anu'; // other ice shards
//const buildLink = 'https://maxroll.gg/d4/planner/a6l40nt6'; // xps ice shards
//const buildLink = 'https://maxroll.gg/d4/planner/m36v0zu5'; // has more blizzard builds
//const buildLink = 'https://maxroll.gg/d4/planner/o2150ney'; // blizzard only
//const buildLink = 'https://maxroll.gg/d4/planner/o36lk01r'; // misanth
//const buildLink = 'https://maxroll.gg/d4/planner/7j2e6041'; // conj
let globalMultipliers = [];

const ignoreGearBonuses = false;
const alwaysCrit = false;
const intGearBonus = 196;
const willGearBonus = 0;
const strGearBonus = 0;
const dexGearBonus = 110;

const vulnGear = 90; 
const critGear = 200;
const critChanceGear = 31.7;
const additiveGear = 0;

const d4Class = 'sorc';
const damageType = 2; // 1 = fire, 2 = lit, 3 = cold
const skillType = 3; // 0 = basic, 1 = core, 3 = conj, 4 = mastery


let strength, intelligence, willpower, dexterity;
let additiveBucket;
let vulnerable;
let critDamage;

//const conditionalDamage = [208, 210, 915, 787, 789, 787, 784, 790, 933];

const data = JSON.parse(fs.readFileSync('data.min.json'));

const profile = buildLink.split('/')[buildLink.split('/').length - 1];

const response = await axios.get(`https://planners.maxroll.gg/profiles/d4/${profile}`);

let best;
const allResults = {};
for (const profile of JSON.parse(response.data.data).profiles) {
    strength =stats[d4Class]['strength'] + (!ignoreGearBonuses && strGearBonus);
    intelligence =stats[d4Class]['intelligence'] + (!ignoreGearBonuses && intGearBonus);
    willpower =stats[d4Class]['willpower'] + (!ignoreGearBonuses && willGearBonus);
    dexterity =stats[d4Class]['dexterity'] + (!ignoreGearBonuses && dexGearBonus);
    
    additiveBucket = new Big(1).add(new Big(!ignoreGearBonuses ? additiveGear : 0).div(100));
    vulnerable = new Big(1.2).add(new Big(!ignoreGearBonuses ? vulnGear : 0).div(100));
    critDamage = new Big(0.50).add(new Big(!ignoreGearBonuses ? critGear : 0).div(100));
    globalMultipliers = [];

    console.log(profile.name);
    const profileDamage = calculateDamage(profile);
    if (!best || best.dmg < profileDamage.total) {
        best = {profile: profile.name, dmg: profileDamage.total};
    }
    allResults[profile.name] = profileDamage;
}

console.log(JSON.stringify(allResults, null, '  '));
console.log(`Best: "${best.profile}" (${best.dmg.toPrecision(4)}x)`);

const csv = await json2csv(Object.keys(allResults).map(e => {
    return {
        name: e,
        ...allResults[e]
    }
}));
fs.writeFileSync(testName + '.csv', csv, {encoding: 'utf-8'});


function calculateDamage(profile) {
    for (const paragon of profile.paragon) {
        loadParagonStats(paragon);
    }

    let i = 0;
    for (const paragon of profile.paragon) {
        applySecondaryRareBonuses(paragon, i++); // add the secondary bonus of rare nodes we now meet the requirements of
    }

    let critChance = new Big(dexterity).times(.02).plus(5).plus(!ignoreGearBonuses ? critChanceGear : 0); //5% baseline + .02% per dex
    critChance = new Big(Math.min(100, critChance.plus(alwaysCrit ? 100 : 0).toNumber()));
    const mainStatMulti = new Big(eval(stats[d4Class]['main'])).div(100).div(10).plus(1);
    const critMulti = new Big(1).plus(critDamage.times(critChance.div(100)));
    const baseMulti = mainStatMulti.times(vulnerable).times(critMulti).times(additiveBucket);
    const finalMultiplier = globalMultipliers.reduce((prev, curr) => prev.times(curr), baseMulti);

    console.log('main:', mainStatMulti.toNumber());
    console.log('additive:', additiveBucket.toPrecision(4));
    console.log('vulnerable:', vulnerable.toPrecision(4));
    console.log('crit:', critMulti.toPrecision(4));

    console.log(`${profile.name} multi: ${finalMultiplier.toPrecision(4)}`);
    console.log('\n');
    return {
        main: +mainStatMulti.toPrecision(4),
        additive: +additiveBucket.toPrecision(4),
        vulnerable: +vulnerable.toPrecision(4),
        crit: +critMulti.toPrecision(4),
        total: +finalMultiplier.toPrecision(4)
    };
}

function loadParagonStats(paragon) {
    const board = data.paragonBoards[paragon.id];

    let glyphPosition;
    for (const key of Object.keys(paragon.nodes)) {
        const node = data.paragonNodes[board.nodes[+key]];
        if (node.name ==='Glyph Socket') {
            glyphPosition = key;
        }
        for (const attribute of node.attributes) {    
            if (attribute.formula.includes('ParagonNodeCoreStat') ||
                attribute.formula.includes('CritDamage') ||
                attribute.formula.includes('BonusToVulnerable')) {
                addStats(attribute);
            } else if (attribute.formula.includes('ParagonNodeDamageBonus')) {
                if (isRelevantBonus(attribute))
                    additiveBucket = additiveBucket.add(new Big(data.attributeFormulas[attribute.formula][0].formula));
            } else if (attribute.formula.includes('DamageTo') || attribute.formula.includes('Additive')) {
                console.log('implement:', f);
            } else { // other things like DR and armor, resistance go here
                const f = attribute.formula;
                //console.log(f); 
            }
        }
    }
    
    applyGlyphs(paragon.id, paragon.nodes, glyphPosition, paragon.glyph, paragon.glyphLevel);
}

function applySecondaryRareBonuses(paragon, ParagonBoardEquipIndex) {
    const board = data.paragonBoards[paragon.id];
    const secondaryNodesEffects = {}; // keep hold of the rare positions we meet the requirements for. used for calculating Tactician bonus against subset of nodes
    let glyphPosition;
    for (const key of Object.keys(paragon.nodes)) {
        const node = data.paragonNodes[board.nodes[+key]];
        if (node.name ==='Glyph Socket') {
            glyphPosition = key;
        }
        if (node.rarity === 3) {
            const requirements = node.thresholds[0];
            const attributes = data.paragonThresholds[requirements].attributes;

            let hasRequirements = true;
            for (const attribute of attributes) {    
                const requiredValue = eval(attribute.value);
                if (attribute.id === 16) { // str
                    hasRequirements = strength >= requiredValue;
                } else if (attribute.id === 17) { // int
                    hasRequirements = intelligence >= requiredValue;
                } else if (attribute.id === 18) { // willpower
                    hasRequirements = willpower >= requiredValue;
                } else if (attribute.id === 19) { // dex
                    hasRequirements = dexterity >= requiredValue;
                } else {
                    console.log('unknown requirements', requirements);
                }
                if (!hasRequirements)
                    break;
            }
            if (hasRequirements) { // apply the bonus if all requirements are met
                const bonusAttribute = node.attributes[0] // the "Major" bonus is always first and it's the one that is applied as bonus
                
                if (bonusAttribute.formula.includes('ParagonNodeCoreStat') ||
                    bonusAttribute.formula.includes('CritDamage') ||
                    bonusAttribute.formula.includes('BonusToVulnerable')) {
                        addStats(bonusAttribute);
                } else if (bonusAttribute.formula.includes('ParagonNodeDamageBonus')) {
                    if (isRelevantBonus(bonusAttribute))
                        additiveBucket = additiveBucket.add(new Big(data.attributeFormulas[bonusAttribute.formula][0].formula));
                } else {
                    const f = bonusAttribute.formula;
                    //console.log(f); // other things like DR and armor, resistance go here
                }

                secondaryNodesEffects[key] = 1;
            }
        }
    }
    
    const glyph = data.paragonGlyphs[paragon.glyph];
    if (glyph && (glyph.affixes.includes("Nodes_BonusToRare") || glyph.affixes.includes("Nodes_BonusToNonPhysical")) && secondaryNodesEffects) {
        applyGlyphs(paragon.id, secondaryNodesEffects, glyphPosition, paragon.glyph, paragon.glyphLevel, true);
    }
}

function addStats(attribute, effectiveNess=1) {
    const gain = new Big(data.attributeFormulas[attribute.formula][0].formula).times(effectiveNess);
    if (attribute.id === 7) {
        strength += gain.toNumber();
    }
    else if (attribute.id === 8) {
        intelligence += gain.toNumber();
    }
    else if (attribute.id === 9) {
        willpower += gain.toNumber();
    }
    else if (attribute.id === 10) {
        dexterity += gain.toNumber();
    } else if (attribute.id === 613) { // vulnerable
        vulnerable = vulnerable.add(gain);
    } else if (attribute.id === 232 || attribute.id === 234) { // crit damage
        critDamage = critDamage.add(gain);
    } else {
        //console.log('attr', attribute.formula);
    }
}

/*
    boards are 21x21. maxroll represents boards starting at 0 in the toplevel and going across each row, incrementing by 1.
    to find the surrounding nodes affecting a glyph, we start in the first row affected by the glyph which would be a single node,
    then 3 nodes, then 5, then 7, 9, and mirror it back down
*/
function applyGlyphs(boardId, nodes, glyphPosition, glyphId, glyphLevel, majorOnly=false) {
    const glyph = data.paragonGlyphs[glyphId];
    if (glyph) {
        for (const affix of glyph.affixes) {
            if (affix.startsWith('Power_'))  { // TODO: secondary effects of glyphs
                //console.log('glyph multi not implemented yet'); // ex: multipliers of exploit/territorial, etc
            } else if (affix.startsWith('DamageTo') || affix === 'Nodes_BonusToRare' ||
                affix === 'Nodes_BonusToNonPhysical' || affix === 'MajorDestructionCritDamage_Dexterity_Side' ||
                (affix.startsWith('ConjurationDamage') && skillType === 3) || affix === "DamageWhileHealthy_Willpower_Side" || 
                (affix.startsWith('MasteryDamage') && skillType === 4)) { // conditional additive damages or rare bonuses (Tactician) 
                    applyBonusesInRadius(boardId, nodes, glyphPosition, glyphId, glyphLevel, affix, majorOnly);
            } else {
                console.log('missing glyph', glyph); // TODO: adept, destruction, crackling energy (conditional skill damage core/mastery/etc)
            }
        }
    }
}

function applyBonusesInRadius(boardId, nodes, glyphPosition, glyph, glyphLevel, glyphAffix, majorOnly) {
    const radius = glyphLevel >= 15 ? 4 : 3;

    const affix = data.paragonGlyphAffixes[glyphAffix];
    const coefficient = new Big(data.attributeFormulas[affix.formula][0].formula).times(affix.displayFactor);

    const base = new Big(affix.base);
    const perLevel = new Big(affix.perLevel);
    const bonus = coefficient.times(base.plus(perLevel.times(glyphLevel-1))).div(100.0);

    const allNodes = data.paragonBoards[boardId].nodes;
    for (let i = radius; i >= -radius; i--) { // we want 1 3 5 7 9 7 5 3 1
        const affected = 1 + (radius - Math.abs(i)) * 2
        const middle = glyphPosition - i * 21; 
        for (let j = middle - Math.floor(affected/2); j <= middle + Math.floor(affected/2); j++) { 
            if (nodes[j]) { // we have a node in radius
                const node = data.paragonNodes[allNodes[j]];
                
                if (glyphAffix === 'Nodes_BonusToRare') {
                    if (node.rarity === 3) { // apply bonus for rare attributes
                        for (const attribute of node.attributes) {
                            if (!majorOnly || attribute.formula.includes("Major")) {
                                addStats(attribute, bonus);
                            }
                        }
                    } 
                } else if (glyphAffix === 'Nodes_BonusToNonPhysical') {
                    for (const attribute of node.attributes) {
                        if (attribute.id === 210) {
                            if (!majorOnly || attribute.formula.includes("Major")) {
                                const nodeBase = new Big(data.attributeFormulas[attribute.formula][0].formula);
                                additiveBucket = additiveBucket.add(bonus.times(nodeBase));
                            }
                        }
                    }
                } else {
                    const statNeeded = data.paragonGlyphAffixes[glyphAffix].convertedAttributes[0].from.id
                    const statTo = data.paragonGlyphAffixes[glyphAffix].convertedAttributes[0].to;
                    const contributor = node.attributes.find(e => e.id === statNeeded);
                    if (contributor) { // only contribute for the select stat of the glyph
                        const stat = +(data.attributeFormulas[contributor.formula][0].formula);
                        if (statTo.id === 613) {
                            vulnerable = vulnerable.add(bonus.div(5.0).times(stat));
                        } else if (statTo.id === 234) {
                            if (isRelevantBonus(statTo))
                                critDamage = critDamage.add(bonus.div(5.0).times(stat));
                        } else {
                            if (isRelevantBonus(contributor))
                                additiveBucket = additiveBucket.add(bonus.div(5.0).times(stat));
                        }
                    }
                }
            }
        }
    }
}

function isRelevantBonus(attribute) {
    if (attribute.id === 212 && skillType !== 3)
        return false;
    if (attribute.id === 208) {
        if (attribute.param && attribute.param !== damageType) {
            return false;
        }
    }
    if (attribute.id === 234) {
        if (attribute.param && attribute.param === -1460542966 && skillType !== 1) { // core skill crit damage
            return false;
        }
    }
    return true;
}
