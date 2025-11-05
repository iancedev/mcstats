/**
 * Multiple latency measurement strategies for Minecraft servers
 * 
 * Since measuring from the same machine often routes internally,
 * we provide several alternative approaches:
 * 
 * 1. Direct TCP ping (current method)
 * 2. External reference server comparison
 * 3. Multiple external ping points
 * 4. ICMP ping to external servers (if available)
 */

const net = require('net');
const dns = require('dns');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * Strategy 1: Measure latency to known external servers and compare
 * This gives us a baseline - if external servers are X ms away, and
 * Minecraft server is similar, we can estimate external latency
 */
async function measureViaExternalReference(mcHost, mcPort, timeout = 5000) {
  // Known external servers to ping (low latency, highly available)
  const referenceServers = [
    { host: '8.8.8.8', port: 53, name: 'Google DNS' },
    { host: '1.1.1.1', port: 53, name: 'Cloudflare DNS' },
    { host: '208.67.222.222', port: 53, name: 'OpenDNS' }
  ];

  const measurements = [];
  
  for (const ref of referenceServers) {
    try {
      const start = Date.now();
      await new Promise((resolve, reject) => {
        const socket = new net.Socket();
        socket.setTimeout(timeout);
        socket.on('connect', () => {
          socket.destroy();
          resolve(Date.now() - start);
        });
        socket.on('error', reject);
        socket.on('timeout', () => {
          socket.destroy();
          reject(new Error('Timeout'));
        });
        socket.connect(ref.port, ref.host);
      });
      const latency = Date.now() - start;
      measurements.push({ server: ref.name, latency });
    } catch (e) {
      // Skip failed measurements
    }
  }

  if (measurements.length === 0) {
    return null;
  }

  // Average latency to external servers
  const avgExternalLatency = measurements.reduce((sum, m) => sum + m.latency, 0) / measurements.length;
  console.log(`[Latency] Average latency to external reference servers: ${Math.round(avgExternalLatency)}ms`);

  // Now measure Minecraft server
  try {
    const mcStart = Date.now();
    await new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(timeout);
      socket.on('connect', () => {
        socket.destroy();
        resolve(Date.now() - mcStart);
      });
      socket.on('error', reject);
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Timeout'));
      });
      socket.connect(mcPort, mcHost);
    });
    const mcLatency = Date.now() - mcStart;
    
    // If Minecraft latency is similar to external reference latency,
    // it's likely going through the network properly
    if (mcLatency < 10 && avgExternalLatency > 20) {
      // Minecraft is much faster than external servers - likely internal routing
      // Estimate external latency as similar to reference servers
      return Math.round(avgExternalLatency);
    }
    
    return Math.round(mcLatency);
  } catch (e) {
    return null;
  }
}

/**
 * Strategy 2: Use ICMP ping to measure network quality
 * This requires system ping command and may not work in all environments
 */
async function measureViaICMP(host, timeout = 5000) {
  try {
    const { stdout } = await execPromise(`ping -c 1 -W ${timeout} ${host}`, { timeout: timeout + 1000 });
    // Parse ping output (format varies by OS)
    const match = stdout.match(/time=(\d+\.?\d*)\s*ms/);
    if (match) {
      return Math.round(parseFloat(match[1]));
    }
  } catch (e) {
    // ICMP not available or failed
    return null;
  }
  return null;
}

/**
 * Strategy 3: Measure from multiple external DNS servers
 * Resolve the hostname from multiple external DNS servers and measure
 */
async function measureViaMultipleDNS(mcHost, mcPort, timeout = 5000) {
  const dnsServers = ['8.8.8.8', '1.1.1.1', '208.67.222.222'];
  const resolver = new dns.Resolver();
  
  const results = [];
  
  for (const dnsServer of dnsServers) {
    try {
      resolver.setServers([dnsServer]);
      const ips = await new Promise((resolve, reject) => {
        resolver.resolve4(mcHost, (err, addresses) => {
          if (err) reject(err);
          else resolve(addresses);
        });
      });
      
      if (ips.length > 0) {
        const ip = ips[0];
        const start = Date.now();
        await new Promise((resolve, reject) => {
          const socket = new net.Socket();
          socket.setTimeout(timeout);
          socket.on('connect', () => {
            socket.destroy();
            resolve(Date.now() - start);
          });
          socket.on('error', reject);
          socket.on('timeout', () => {
            socket.destroy();
            reject(new Error('Timeout'));
          });
          socket.connect(mcPort, ip);
        });
        const latency = Date.now() - start;
        results.push({ dnsServer, ip, latency });
      }
    } catch (e) {
      // Skip failed measurements
    }
  }
  
  if (results.length === 0) {
    return null;
  }
  
  // Return median latency
  const latencies = results.map(r => r.latency).sort((a, b) => a - b);
  const median = latencies[Math.floor(latencies.length / 2)];
  return median;
}

/**
 * Strategy 4: Use external latency measurement service (if available)
 * Could integrate with services like:
 * - ip-api.com (free tier available)
 * - ipinfo.io
 * - Or self-hosted measurement endpoints
 */
async function measureViaExternalService(mcHost, mcPort) {
  // This would require an external service API
  // For now, this is a placeholder for future implementation
  // Example: fetch(`https://api.example.com/ping?host=${mcHost}&port=${mcPort}`)
  return null;
}

/**
 * Combined strategy: Try multiple methods and return the best estimate
 */
async function measureLatencyMultiStrategy(mcHost, mcPort, timeout = 5000) {
  const strategies = [];
  
  // Strategy 1: External reference comparison
  console.log('[Latency] Trying external reference comparison...');
  const refLatency = await measureViaExternalReference(mcHost, mcPort, timeout);
  if (refLatency !== null) {
    strategies.push({ method: 'external_reference', latency: refLatency });
    console.log(`[Latency] External reference: ${refLatency}ms`);
  }
  
  // Strategy 2: Multiple DNS resolution
  console.log('[Latency] Trying multiple DNS resolution...');
  const dnsLatency = await measureViaMultipleDNS(mcHost, mcPort, timeout);
  if (dnsLatency !== null) {
    strategies.push({ method: 'multiple_dns', latency: dnsLatency });
    console.log(`[Latency] Multiple DNS: ${dnsLatency}ms`);
  }
  
  // Strategy 3: ICMP ping (if available)
  console.log('[Latency] Trying ICMP ping...');
  const icmpLatency = await measureViaICMP(mcHost, timeout);
  if (icmpLatency !== null) {
    strategies.push({ method: 'icmp', latency: icmpLatency });
    console.log(`[Latency] ICMP: ${icmpLatency}ms`);
  }
  
  if (strategies.length === 0) {
    return null;
  }
  
  // Return the median latency from all successful strategies
  const latencies = strategies.map(s => s.latency).sort((a, b) => a - b);
  const median = latencies[Math.floor(latencies.length / 2)];
  const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  
  console.log(`[Latency] Multiple strategies results: ${strategies.map(s => `${s.method}=${s.latency}ms`).join(', ')}`);
  console.log(`[Latency] Using median: ${median}ms (average: ${avg}ms)`);
  
  return {
    latency: median,
    average: avg,
    methods: strategies,
    confidence: strategies.length > 1 ? 'high' : 'medium'
  };
}

module.exports = {
  measureViaExternalReference,
  measureViaICMP,
  measureViaMultipleDNS,
  measureViaExternalService,
  measureLatencyMultiStrategy
};

