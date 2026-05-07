// MAC OUI (Organizationally Unique Identifier) → fabrikant lookup. Wij houden
// een compacte ingebouwde tabel bij van veelvoorkomende smart-home, IoT,
// computer- en netwerk-fabrikanten. De volledige IEEE-database is enorm
// (tienduizenden entries); voor onze doelen volstaat deze lijst, want als
// we de fabrikant niet kennen geven we 'Onbekend' terug.
//
// Bron: openbare IEEE OUI database. Eerste 6 hex-karakters van de MAC zijn
// de OUI. Niet hoofdletter-gevoelig.

const OUI = {
  // Apple
  '000a27': 'Apple', '000d93': 'Apple', '0010fa': 'Apple', '001451': 'Apple',
  '001e52': 'Apple', '0021e9': 'Apple', '0023df': 'Apple', '00254b': 'Apple',
  '00264a': 'Apple', '04489a': 'Apple', '04d3cf': 'Apple', '04f13e': 'Apple',
  '083e8e': 'Apple', '0c4de9': 'Apple', '0cd746': 'Apple', '14109f': 'Apple',
  '149fe8': 'Apple', '18af8f': 'Apple', '1c1ac0': 'Apple', '20a2e4': 'Apple',
  '24a074': 'Apple', '283737': 'Apple', '28cfda': 'Apple', '34159e': 'Apple',
  '34a395': 'Apple', '38b54d': 'Apple', '3c0754': 'Apple', '40a6d9': 'Apple',
  '40b395': 'Apple', '442a60': 'Apple', '485a3f': 'Apple', '4c8d79': 'Apple',
  '54260a': 'Apple', '5855ca': 'Apple', '5ccff4': 'Apple', '6045bd': 'Apple',
  '60c547': 'Apple', '64b9e8': 'Apple', '68a86d': 'Apple', '6c4d73': 'Apple',
  '6c709f': 'Apple', '6c8336': 'Apple', '70cd60': 'Apple', '74e2f5': 'Apple',
  '78d75f': 'Apple', '7831c1': 'Apple', '7c6df8': 'Apple', '8030dc': 'Apple',
  '8863df': 'Apple', '8c8590': 'Apple', '907240': 'Apple', '98b8e3': 'Apple',
  '9803d8': 'Apple', '9cf48e': 'Apple', 'a4b805': 'Apple', 'a886dd': 'Apple',
  'ac3c0b': 'Apple', 'b418d1': 'Apple', 'b8e856': 'Apple', 'bc926b': 'Apple',
  'c869cd': 'Apple', 'd0e140': 'Apple', 'd83062': 'Apple', 'dca904': 'Apple',
  'e0acdb': 'Apple', 'e80688': 'Apple', 'f0c1f1': 'Apple', 'f4f15a': 'Apple',
  '5cf938': 'Apple', '88c663': 'Apple',

  // Raspberry Pi Foundation / Trading
  'b827eb': 'Raspberry Pi', 'dca632': 'Raspberry Pi', 'e45f01': 'Raspberry Pi',
  '28cdc1': 'Raspberry Pi', 'd83add': 'Raspberry Pi', '2ccf67': 'Raspberry Pi',

  // Espressif (ESP8266/ESP32 — basis voor veel ESPHome/Tasmota apparaten)
  '24a160': 'Espressif', '2462ab': 'Espressif', '2cf432': 'Espressif',
  '30aea4': 'Espressif', '34865d': 'Espressif', '3c61cf': 'Espressif',
  '3c71bf': 'Espressif', '3cca4f': 'Espressif', '40f520': 'Espressif',
  '4827e2': 'Espressif', '4c11ae': 'Espressif', '500291': 'Espressif',
  '5ccf7f': 'Espressif', '600194': 'Espressif', '68c63a': 'Espressif',
  '7c9ebd': 'Espressif', '7cdfa1': 'Espressif', '80646f': 'Espressif',
  '807d3a': 'Espressif', '84cca8': 'Espressif', '84f3eb': 'Espressif',
  '8caab5': 'Espressif', '90974e': 'Espressif', 'a020a6': 'Espressif',
  'a4cf12': 'Espressif', 'a4e57c': 'Espressif', 'a8032a': 'Espressif',
  'a86bad': 'Espressif', 'ac0bfb': 'Espressif', 'b4e62d': 'Espressif',
  'bcdcd2': 'Espressif', 'bcddc2': 'Espressif', 'bcff4d': 'Espressif',
  'c44f33': 'Espressif', 'c8c9a3': 'Espressif', 'cc50e3': 'Espressif',
  'd8a01d': 'Espressif', 'd8bfc0': 'Espressif', 'dc4f22': 'Espressif',
  'e09806': 'Espressif', 'e8db84': 'Espressif', 'ec64c9': 'Espressif',
  'ec94cb': 'Espressif', 'ecfabc': 'Espressif', 'f08a76': 'Espressif',
  'f4cfa2': 'Espressif', 'f8b568': 'Espressif', 'fcf5c4': 'Espressif',

  // Philips (Hue Bridge + Hue Smart Plug etc.)
  '001788': 'Philips Hue', '0017a4': 'Philips', '00177b': 'Philips',
  '0024a8': 'Philips', '00272d': 'Philips', '34dc8c': 'Philips',
  '00179a': 'Philips', 'ec1bbd': 'Philips Hue',

  // Sonos
  '000e58': 'Sonos', '5cae09': 'Sonos', '78282a': 'Sonos', 'b8e937': 'Sonos',
  'b8e9ce': 'Sonos', 'f0f6c1': 'Sonos', '94f6d6': 'Sonos', '347f99': 'Sonos',
  '5cae9b': 'Sonos', '4801c9': 'Sonos',

  // Google (Nest, Chromecast, Home)
  '0012b1': 'Google', '0014e8': 'Google', '0023df': 'Google',
  '54608b': 'Google', '6464ad': 'Google', '6cad9f': 'Google',
  '6c08b3': 'Google', '6cad9f': 'Google', '94eb2c': 'Google',
  'a4778d': 'Google', 'd0e1f4': 'Google', 'fc69b1': 'Google',
  '38ce64': 'Google', 'a48cdb': 'Google',

  // Amazon (Echo, Fire TV, Ring)
  '0c47c9': 'Amazon', '40b4cd': 'Amazon', '44650d': 'Amazon',
  '4c1744': 'Amazon', '50dcc4': 'Amazon', '60382a': 'Amazon',
  '6837e9': 'Amazon', '74c246': 'Amazon', '74d637': 'Amazon',
  '78e103': 'Amazon', '847dd4': 'Amazon', '8871e5': 'Amazon',
  '8c2cf5': 'Amazon', '8caab5': 'Amazon', 'a002dc': 'Amazon',
  'a0d0dc': 'Amazon', 'ac63be': 'Amazon', 'b079bd': 'Amazon',
  'cc9ea2': 'Amazon', 'cce80a': 'Amazon', 'fc65de': 'Amazon',
  'fce8c0': 'Amazon', '188b9d': 'Amazon',

  // Shelly (Allterco Robotics)
  '34945c': 'Shelly', '60018f': 'Shelly', '8caab5': 'Shelly',
  '98cdac': 'Shelly', 'b4e62d': 'Shelly', 'c45bbe': 'Shelly',
  'e8db84': 'Shelly', 'b8d61a': 'Shelly', '083af2': 'Shelly',
  '485519': 'Shelly',

  // IKEA Tradfri
  '142d27': 'IKEA', '7cb03e': 'IKEA',

  // Samsung
  '00159d': 'Samsung', '001632': 'Samsung', '001a8a': 'Samsung',
  '001eaa': 'Samsung', '0023d6': 'Samsung', '002566': 'Samsung',
  '0e8d3a': 'Samsung', '105279': 'Samsung', '14b484': 'Samsung',
  '1c5a3e': 'Samsung', '20d390': 'Samsung', '2cae2b': 'Samsung',
  '34145f': 'Samsung', '3899cd': 'Samsung', '3c8bcd': 'Samsung',
  '4844f7': 'Samsung', '5440ad': 'Samsung', '54bd79': 'Samsung',
  '60c5ad': 'Samsung', '64b853': 'Samsung', '78f7be': 'Samsung',
  '88329b': 'Samsung', '94350a': 'Samsung', 'a000bb': 'Samsung',
  'b07d62': 'Samsung', 'c81479': 'Samsung', 'cc07ab': 'Samsung',
  'e8508b': 'Samsung', 'fcaa14': 'Samsung',

  // TP-Link
  '0007a6': 'TP-Link', '001f59': 'TP-Link', '0023cd': 'TP-Link',
  '14ebb6': 'TP-Link', '40169f': 'TP-Link', '5091e3': 'TP-Link',
  '5400e8': 'TP-Link', '60a4b7': 'TP-Link', '64664b': 'TP-Link',
  '7058a4': 'TP-Link', '70a741': 'TP-Link', '74ea3a': 'TP-Link',
  '90f652': 'TP-Link', 'a42bb0': 'TP-Link', 'b0487a': 'TP-Link',
  'b0c554': 'TP-Link', 'b482fe': 'TP-Link', 'b4b024': 'TP-Link',
  'c46e1f': 'TP-Link', 'c4e90a': 'TP-Link', 'c4e984': 'TP-Link',
  'd80d17': 'TP-Link', 'd84732': 'TP-Link', 'e848b8': 'TP-Link',
  'ec086b': 'TP-Link', 'f0a731': 'TP-Link',

  // Netgear
  '00146c': 'Netgear', '001b2f': 'Netgear', '001e2a': 'Netgear',
  '001f33': 'Netgear', '00264f': 'Netgear', '20e52a': 'Netgear',
  '288088': 'Netgear', '2cb05d': 'Netgear', '405d82': 'Netgear',
  '44a56e': 'Netgear', '4c60de': 'Netgear', '6038e0': 'Netgear',
  '6cb0ce': 'Netgear', 'a040a0': 'Netgear', 'a08869': 'Netgear',
  'b0b98a': 'Netgear', 'c03f0e': 'Netgear', 'c40415': 'Netgear',

  // Asus / Asustek
  '049226': 'ASUS', '0c9d92': 'ASUS', '0cf9e0': 'ASUS', '107b44': 'ASUS',
  '107c61': 'ASUS', '1c872c': 'ASUS', '244bfe': 'ASUS', '2c4d54': 'ASUS',
  '305a3a': 'ASUS', '38d547': 'ASUS', '40167e': 'ASUS', '40b076': 'ASUS',
  '50465d': 'ASUS', '54a050': 'ASUS', '60a44c': 'ASUS', '704d7b': 'ASUS',
  '74d02b': 'ASUS', '7824af': 'ASUS', '88d7f6': 'ASUS', '90e6ba': 'ASUS',
  'ac220b': 'ASUS', 'ac9e17': 'ASUS', 'b06ebf': 'ASUS', 'bc5ff4': 'ASUS',
  'd017c2': 'ASUS', 'd45d64': 'ASUS', 'e03f49': 'ASUS', 'f02f74': 'ASUS',
  'f832e4': 'ASUS', 'f8328a': 'ASUS', 'fc3497': 'ASUS',

  // AVM (Fritz!Box)
  '0004x4': 'AVM Fritz!Box', '00040e': 'AVM Fritz!Box', '0015fa': 'AVM Fritz!Box',
  '0019e3': 'AVM Fritz!Box', '001cc8': 'AVM Fritz!Box', '0024fe': 'AVM Fritz!Box',
  '0026fe': 'AVM Fritz!Box', '08967a': 'AVM Fritz!Box', '20b8c5': 'AVM Fritz!Box',
  '244bfe': 'AVM Fritz!Box', '247f35': 'AVM Fritz!Box', '38108c': 'AVM Fritz!Box',
  '3810d5': 'AVM Fritz!Box', '5c4994': 'AVM Fritz!Box', '5c7d5e': 'AVM Fritz!Box',
  '7833f1': 'AVM Fritz!Box', '90449a': 'AVM Fritz!Box', '9c537f': 'AVM Fritz!Box',
  'a0e4cb': 'AVM Fritz!Box', 'a0e4cb': 'AVM Fritz!Box', 'b0c4e7': 'AVM Fritz!Box',
  'cc0e7f': 'AVM Fritz!Box', 'd00ed9': 'AVM Fritz!Box', 'dccd6f': 'AVM Fritz!Box',
  'e065c2': 'AVM Fritz!Box', 'e84e06': 'AVM Fritz!Box', 'eccd6f': 'AVM Fritz!Box',
  'f018e7': 'AVM Fritz!Box',

  // Synology
  '0011321': 'Synology', '0011322': 'Synology', '00113217': 'Synology',
  '001132': 'Synology', '0019d2': 'Synology',

  // Sony
  '0019c5': 'Sony', '001a80': 'Sony', '001ddf': 'Sony', '00248d': 'Sony',
  '002bc0': 'Sony', '54421b': 'Sony', '5c96f3': 'Sony', '7c61b8': 'Sony',
  '94db56': 'Sony', 'ac9b0a': 'Sony',

  // LG
  '0019c1': 'LG', '001cd3': 'LG', '001ee1': 'LG', '00213e': 'LG',
  '20bbe9': 'LG', '40b0fa': 'LG', '4836d8': 'LG', '64bc0c': 'LG',
  '74a722': 'LG', '88c9d0': 'LG', 'a4346a': 'LG', 'd2a04f': 'LG',
  'a86195': 'LG',

  // HP
  '001083': 'HP', '0010e3': 'HP', '0011a3': 'HP', '0014c2': 'HP',
  '001560': 'HP', '0017a4': 'HP', '0018fe': 'HP', '001a4b': 'HP',
  '001b78': 'HP', '001cc4': 'HP', '001e0b': 'HP', '001f29': 'HP',
  '00215a': 'HP', '0023ae': 'HP', '002264': 'HP', '0024a8': 'HP',
  '0025b3': 'HP', '00306e': 'HP', '003064': 'HP', '003086': 'HP',
  '0030c1': 'HP', '00508b': 'HP', '180373': 'HP', '1c4d70': 'HP',
  '24be05': 'HP', '2c44fd': 'HP', '2c768a': 'HP', '38eaa7': 'HP',
  '3c4a92': 'HP', '5065f3': 'HP', '5cb901': 'HP', '6cc217': 'HP',
  '78e7d1': 'HP', '80c16e': 'HP', '94debf': 'HP', '9c8e99': 'HP',
  'a45d36': 'HP', 'b0afe7': 'HP', 'b4b52f': 'HP', 'c8cbb8': 'HP',
  'cc3e5f': 'HP', 'd0bf9c': 'HP', 'd48564': 'HP', 'd8d385': 'HP',
  'e4115b': 'HP', 'ec9a74': 'HP', 'f4ce46': 'HP',

  // Dell
  '0006b1': 'Dell', '00065b': 'Dell', '0008c7': 'Dell', '000874': 'Dell',
  '000acc': 'Dell', '000bdb': 'Dell', '000d56': 'Dell', '000e0c': 'Dell',
  '000f1f': 'Dell', '00118e': 'Dell', '0012f0': 'Dell', '0013e8': 'Dell',
  '00188b': 'Dell', '0019b9': 'Dell', '0019dd': 'Dell', '001ce6': 'Dell',
  '00219b': 'Dell', '0024e8': 'Dell', '00263b': 'Dell', '14fe9a': 'Dell',
  '18a99b': 'Dell', '20040f': 'Dell', '24b6fd': 'Dell', '2c600c': 'Dell',
  '341a4c': 'Dell', '442a60': 'Dell', '5cf9dd': 'Dell', '6400f1': 'Dell',
  '78313e': 'Dell', '784ff7': 'Dell', '88532e': 'Dell', '8cec4b': 'Dell',
  '9421a3': 'Dell', '9c2a70': 'Dell', 'a4baba': 'Dell', 'a8b0d6': 'Dell',
  'b083fe': 'Dell', 'b4e10f': 'Dell', 'bc305b': 'Dell', 'd067e5': 'Dell',
  'd0946b': 'Dell', 'e8b1fc': 'Dell', 'f4cab5': 'Dell',

  // Microsoft (Surface, Xbox)
  '00125a': 'Microsoft', '00155d': 'Microsoft', '0017fa': 'Microsoft',
  '0050f2': 'Microsoft', '281878': 'Microsoft', '485d60': 'Microsoft',
  '50dccc': 'Microsoft', '7c1e52': 'Microsoft', 'a0bdcd': 'Microsoft',
  'c83f26': 'Microsoft',

  // IPP / printers
  '0001e6': 'Hewlett-Packard', '00137d': 'Brother',
  '008092': 'Silex/printer', '00400c': 'IBM/Lexmark',
  '00400d': 'Lexmark', '0025fc': 'Brother',

  // Xiaomi (smart bulbs, vacuums, etc.)
  '0c1dc6': 'Xiaomi', '14a364': 'Xiaomi', '188fca': 'Xiaomi',
  '286c07': 'Xiaomi', '34cdbe': 'Xiaomi', '3c8d20': 'Xiaomi',
  '50a4c8': 'Xiaomi', '74ee2a': 'Xiaomi', '7cb59b': 'Xiaomi',
  '942f78': 'Xiaomi', '9c99a0': 'Xiaomi', '9cf48e': 'Xiaomi',
  'b047bf': 'Xiaomi', 'b0b9d7': 'Xiaomi', 'c4dd57': 'Xiaomi',
  'cc9f7a': 'Xiaomi', 'e055f4': 'Xiaomi', 'e8930c': 'Xiaomi',
  'f0b429': 'Xiaomi', 'f48b32': 'Xiaomi', 'f8a45f': 'Xiaomi',
  'fc640b': 'Xiaomi',

  // Roborock
  '78f5fd': 'Roborock', 'b0f893': 'Roborock',

  // Tuya / SmartLife
  '50ec50': 'Tuya', 'd8f15b': 'Tuya', 'a4cf12': 'Tuya',

  // Belkin / WeMo
  '00226b': 'Belkin', '94103e': 'Belkin', 'b4750e': 'Belkin',
  'c05627': 'Belkin', 'ec1a59': 'Belkin/WeMo',

  // Ubiquiti
  '0418d6': 'Ubiquiti', '0c8ddb': 'Ubiquiti', '24a43c': 'Ubiquiti',
  '44d9e7': 'Ubiquiti', '687251': 'Ubiquiti', '784558': 'Ubiquiti',
  '8030dc': 'Ubiquiti', '802aa8': 'Ubiquiti', 'b4fbe4': 'Ubiquiti',
  'd021f9': 'Ubiquiti', 'dc9fdb': 'Ubiquiti', 'e063da': 'Ubiquiti',
  'f09fc2': 'Ubiquiti', 'fcecda': 'Ubiquiti',

  // Withings, fitbit, garmin, kobo, etc. — minder gangbaar voor begane grond
};

// Locally administered MAC bit (2nd-least-significant bit van eerste octet).
// Wordt gezet voor random/private MACs (iOS, Android, sommige Windows).
function isPrivateMac(mac) {
  if (!mac || mac.length < 2) return false;
  const firstOctet = parseInt(mac.slice(0, 2), 16);
  if (Number.isNaN(firstOctet)) return false;
  return (firstOctet & 0x02) === 0x02;
}

export function lookupVendor(mac) {
  if (!mac || typeof mac !== 'string') return null;
  const clean = mac.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (clean.length < 6) return null;
  if (isPrivateMac(clean)) {
    // Private/randomized MACs (iOS 14+, Android 11+) hebben geen zinvolle OUI
    return 'Privé MAC';
  }
  const oui = clean.slice(0, 6);
  return OUI[oui] || null;
}
