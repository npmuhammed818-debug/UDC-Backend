import {Resvg} from '@resvg/resvg-js';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {statusPicture} from './statusPicture.ts';
/** Fixed escaped SVG, no customer markup/URLs. Use the bundled UDC font rather
 * than environment-dependent fallback glyphs. Missing font fails closed. */
export function statusPicturePng(input:{dealNumber:string;status:string;asOf:string}){
 const font=['artifacts/udc-app/public/fonts/jbmono-400.ttf','../udc-app/public/fonts/jbmono-400.ttf'].map(p=>resolve(process.cwd(),p)).find(existsSync);if(!font)throw Error('status_picture_font_unavailable');
 return new Resvg(statusPicture(input),{fitTo:{mode:'width',value:1140},font:{loadSystemFonts:false,fontFiles:[font],defaultFontFamily:'JetBrains Mono',monospaceFamily:'JetBrains Mono'}}).render().asPng();
}
