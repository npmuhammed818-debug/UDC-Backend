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
