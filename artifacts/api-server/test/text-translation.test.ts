import test from "node:test";import assert from "node:assert/strict";import {translatedTextOk} from "../src/akif/textTranslation.ts";

test('attached currency/unit and comparison signs cannot silently change',()=>{
 for(const [source,changed] of [['Offer 100USD for 20MT','Offre 100EUR pour 20MT'],['Offer 100USD for 20MT','Offre 100USD pour 20KG'],['Price <=100 USD','Prix >=100 USD'],['Pack 30 cartons','Lot 30 pieces']])assert.equal(translatedTextOk(changed,source,'french'),false,source+' -> '+changed);
});

test('attached critical tokens survive only unchanged and remain bounded from ordinary words',()=>{
 assert.equal(translatedTextOk('Offre 100USD pour 20MT, prix <=100 USD','Offer 100USD for 20MT, price <=100 USD','french'),true);
 assert.equal(translatedTextOk('Le nombre total est clair','The total number is clear','french'),true);
 for(const [source,changed] of [['20kg','20MT'],['100AED','100USD'],['10 USD/kg','10 USD/MT'],['>=10 MT','>10 MT'],['30 cartons','30 containers']])assert.equal(translatedTextOk(changed,source,'french'),false);
});

test('currency symbols outside the original short list cannot be changed or dropped',()=>{
 for(const [source,result] of [['Price ¥100 per MT','വില ₩100 per MT'],['Price ₺100','വില 100'],['Price ₦100','വില ₱100'],['Price ₿1','വില 1']])assert.equal(translatedTextOk(result,source,'malayalam'),false,source);
});

test('Unicode arithmetic signs in trade figures cannot disappear or change',()=>{
 for(const [source,result] of [['Adjustment −100 USD','Ajustement 100 USD'],['Quantity 10 ± 2 MT','Quantite 10 2 MT'],['Price ≈100 USD','Prix =100 USD'],['Quantity 10 − 2 MT','Quantite 10 + 2 MT']])assert.equal(translatedTextOk(result,source,'french'),false,source);
 assert.equal(translatedTextOk('Ajustement −100 USD','Adjustment −100 USD','french'),true);
});

test('standalone ASCII subtraction cannot disappear or turn positive',()=>{
 for(const [source,result] of [['Quantity 10 - 2 MT','Quantite 10 2 MT'],['Adjustment - 100 USD','Ajustement 100 USD'],['Quantity 10 - 2 MT','Quantite 10 + 2 MT']])assert.equal(translatedTextOk(result,source,'french'),false,source);
 assert.equal(translatedTextOk('Quantite 10 - 2 MT','Quantity 10 - 2 MT','french'),true);
});

test('non-ASCII percentage and per-mille units cannot disappear or change',()=>{
 for(const [source,result] of [['Purity ٩٩٪','Purete ٩٩'],['Tolerance 2‰','Tolerance 2%'],['Tolerance 2‱','Tolerance 2‰']])assert.equal(translatedTextOk(result,source,'french'),false,source);
 assert.equal(translatedTextOk('Purete ٩٩٪','Purity ٩٩٪','french'),true);
});
