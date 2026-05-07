// Detecteert het primaire IPv4 /24 subnet van de host. Kijkt naar
// `os.networkInterfaces()` en pakt de eerste niet-loopback, niet-internal
// IPv4 met een /24 netmask. Geeft een lijst van alle 254 bruikbare host-IP's
// terug zodat ze parallel gescand kunnen worden.

import os from 'node:os';

function ipToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function intToIp(n) {
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ].join('.');
}

function netmaskPrefix(mask) {
  return ipToInt(mask)
    .toString(2)
    .padStart(32, '0')
    .split('')
    .filter((b) => b === '1').length;
}

export function detectSubnet() {
  const ifaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family !== 'IPv4') continue;
      if (a.internal) continue;
      if (!a.netmask) continue;
      const prefix = netmaskPrefix(a.netmask);
      // /24 (of breder) is praktisch voor een sweep; smallere subnets ook
      // toestaan als ze niet te groot worden.
      if (prefix < 22) continue; // > 1024 hosts → te traag, sla over
      const ipInt = ipToInt(a.address);
      const maskInt = ipToInt(a.netmask);
      const networkInt = ipInt & maskInt;
      const broadcastInt = networkInt | (~maskInt >>> 0);
      const hosts = [];
      for (let n = networkInt + 1; n < broadcastInt; n++) {
        hosts.push(intToIp(n));
      }
      return {
        interface: name,
        localIp: a.address,
        network: intToIp(networkInt),
        netmask: a.netmask,
        prefix,
        broadcast: intToIp(broadcastInt),
        hosts,
      };
    }
  }
  return null;
}
