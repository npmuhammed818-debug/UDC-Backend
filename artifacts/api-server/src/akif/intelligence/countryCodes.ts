const COUNTRY_CODES: Record<string, string> = {
  "india": "356",
  "united arab emirates": "784",
  "uae": "784",
  "oman": "512",
  "turkey": "792",
  "türkiye": "792",
  "france": "250",
  "united states": "840",
  "usa": "840",
  "us": "840",
  "china": "156",
  "japan": "392",
  "united kingdom": "826",
  "uk": "826",
  "saudi arabia": "682",
  "qatar": "634",
  "bahrain": "048",
  "kuwait": "414",
  "germany": "276",
  "netherlands": "528",
  "singapore": "702",
  "malaysia": "458",
  "thailand": "764",
  "indonesia": "360",
  "vietnam": "704",
};

export function unM49Code(country: string) {
  return COUNTRY_CODES[country.trim().toLowerCase()] ?? null;
}

const ISO_BY_M49: Record<string, string> = {
  "356": "IND", "784": "ARE", "512": "OMN", "792": "TUR", "250": "FRA",
  "840": "USA", "156": "CHN", "392": "JPN", "826": "GBR", "682": "SAU",
  "634": "QAT", "048": "BHR", "414": "KWT", "276": "DEU", "528": "NLD",
  "702": "SGP", "458": "MYS", "764": "THA", "360": "IDN", "704": "VNM",
};
export function isoCountryCode(country: string) {
  const m49 = unM49Code(country);
  return m49 ? ISO_BY_M49[m49] ?? null : null;
}
