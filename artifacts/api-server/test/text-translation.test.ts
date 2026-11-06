import test from "node:test";import assert from "node:assert/strict";import {translatedTextOk} from "../src/akif/textTranslation.ts";

test('attached currency/unit and comparison signs cannot silently change',()=>{
 for(const [source,changed] of [['Offer 100USD for 20MT','Offre 100EUR pour 20MT'],['Offer 100USD for 20MT','Offre 100USD pour 20KG'],['Price <=100 USD','Prix >=100 USD'],['Pack 30 cartons','Lot 30 pieces']])assert.equal(translatedTextOk(changed,source,'french'),false,source+' -> '+changed);
});

test('attached critical tokens survive only unchanged and remain bounded from ordinary words',()=>{
 assert.equal(translatedTextOk('Offre 100USD pour 20MT, prix <=100 USD','Offer 100USD for 20MT, price <=100 USD','french'),true);
 assert.equal(translatedTextOk('Le nombre total est clair','The total number is clear','french'),true);
 for(const [source,changed] of [['20kg','20MT'],['100AED','100USD'],['10 USD/kg','10 USD/MT'],['>=10 MT','>10 MT'],['30 cartons','30 containers']])assert.equal(translatedTextOk(changed,source,'french'),false);
});
