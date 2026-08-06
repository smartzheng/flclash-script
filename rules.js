// 远程脚本地址：https://raw.githubusercontent.com/smartzheng/flclash-script/refs/heads/main/rules.js
function main(config) {
  var groupName = "ChatGPT";
  var fallbackGroupName = "ChatGPT-故障转移";
  var healthCheckUrl = "https://chatgpt.com/cdn-cgi/trace";

  var regionPattern = /台湾|台灣|Taiwan|\bTW\b|日本|東京|东京|Japan|\bJP\b|新加坡|Singapore|\bSG\b|美国|美國|United States|\bUS\b/i;
  var excludedNodePattern = /香港|Hong.?Kong|\bHK\b|澳门|澳門|Macau|\bMO\b|剩余|剩餘|流量|套餐|到期|过期|過期|有效期|重置|expire|expired|traffic|quota|官网|官網|官方|测试|測試|test|测速|測速|直连|直連/i;
  var metadataNodePattern = /剩余|剩餘|流量|套餐|到期|过期|過期|有效期|重置|expire|expired|traffic|quota|官网|官網|官方|测试|測試|test|测速|測速/i;

  function pushUnique(list, value) {
    if (list.indexOf(value) === -1) {
      list.push(value);
    }
  }

  function mergeUnique(base, additions) {
    var result = Array.isArray(base) ? base.slice() : [];
    for (var i = 0; i < additions.length; i++) {
      pushUnique(result, additions[i]);
    }
    return result;
  }

  function isTcpFriendlyProxy(proxy) {
    var type = String((proxy && proxy.type) || "").toLowerCase();
    return !/^(hysteria|hysteria2|tuic|wireguard)$/.test(type);
  }

  function nodePriority(proxy, name) {
    var score = 1000;

    if (proxy && (proxy["reality-opts"] || proxy.flow === "xtls-rprx-vision")) {
      score -= 350;
    } else if (proxy && !proxy.network) {
      score -= 250;
    } else if (proxy && /^(tcp|ws|grpc|http)$/i.test(proxy.network || "")) {
      score -= 150;
    }
    if (proxy && Number(proxy.port) === 443) {
      score -= 80;
    }
    if (/专线|專線|住宅|家宽|家寬|流媒体|流媒體/i.test(name)) {
      score -= 40;
    }
    if (/日本|東京|东京|Japan|\bJP\b/i.test(name)) {
      score -= 300;
    } else if (/新加坡|Singapore|\bSG\b/i.test(name)) {
      score -= 250;
    } else if (/美国|美國|United States|\bUS\b/i.test(name)) {
      score -= 200;
    } else if (/台湾|台灣|Taiwan|\bTW\b/i.test(name)) {
      score -= 150;
    }
    if (/0\.01x|0\.1x|0\.5x/i.test(name)) {
      score += 20;
    }

    return score;
  }

  function getCandidateNodes() {
    var proxies = Array.isArray(config.proxies) ? config.proxies : [];
    var candidates = [];

    for (var i = 0; i < proxies.length; i++) {
      var proxy = proxies[i];
      var name = proxy && proxy.name;
      if (
        typeof name === "string" &&
        isTcpFriendlyProxy(proxy) &&
        regionPattern.test(name) &&
        !excludedNodePattern.test(name)
      ) {
        candidates.push({
          name: name,
          index: i,
          score: nodePriority(proxy, name)
        });
      }
    }

    candidates.sort(function (a, b) {
      return a.score - b.score || a.index - b.index;
    });

    var names = [];
    for (var j = 0; j < candidates.length; j++) {
      pushUnique(names, candidates[j].name);
    }
    return names;
  }

  function cleanGroupProxies(group) {
    if (!Array.isArray(group.proxies)) {
      return;
    }
    group.proxies = group.proxies.filter(function (name) {
      return typeof name !== "string" || !metadataNodePattern.test(name);
    });
  }

  function optimizeExistingGroup(group) {
    cleanGroupProxies(group);

    if (group.type === "url-test") {
      if (typeof group.interval !== "number" || group.interval > 600) {
        group.interval = 600;
      }
      group.timeout = 5000;
      group.lazy = true;
      group["max-failed-times"] = 3;
      if (/generate_204/i.test(group.url || "")) {
        group["expected-status"] = 204;
      }
    } else if (group.type === "fallback") {
      if (typeof group.interval !== "number" || group.interval > 900) {
        group.interval = 900;
      }
      group.timeout = 5000;
      group.lazy = true;
      group["max-failed-times"] = 3;
      if (/generate_204/i.test(group.url || "")) {
        group["expected-status"] = 204;
      }
    }
  }

  function buildProxyGroups() {
    var oldGroups = Array.isArray(config["proxy-groups"])
      ? config["proxy-groups"]
      : [];
    var newGroups = [];

    for (var i = 0; i < oldGroups.length; i++) {
      var group = oldGroups[i];
      if (
        !group ||
        group.name === groupName ||
        group.name === fallbackGroupName
      ) {
        continue;
      }
      optimizeExistingGroup(group);
      newGroups.push(group);
    }

    var candidates = getCandidateNodes();
    var fallbackNodes = candidates.slice(0, 8);
    var fallbackGroup = {
      name: fallbackGroupName,
      type: "fallback",
      url: healthCheckUrl,
      interval: 600,
      timeout: 8000,
      lazy: true,
      "max-failed-times": 2,
      "expected-status": 200,
      hidden: false
    };

    if (fallbackNodes.length > 0) {
      fallbackGroup.proxies = fallbackNodes;
    } else {
      fallbackGroup["include-all"] = true;
      fallbackGroup.filter =
        "(?i)(台湾|台灣|Taiwan|TW|日本|東京|东京|Japan|JP|新加坡|Singapore|SG|美国|美國|United.?States|US)";
      fallbackGroup["exclude-filter"] =
        "(?i)(香港|Hong.?Kong|HK|澳门|澳門|Macau|MO|剩余|剩餘|流量|套餐|到期|过期|過期|有效期|重置|expire|expired|traffic|quota|官网|官網|官方|测试|測試|test|测速|測速|直连|直連)";
      fallbackGroup["exclude-type"] =
        "(?i)(Hysteria|Hysteria2|TUIC|WireGuard)";
    }

    var selectable = [];
    if (candidates.length > 0) {
      selectable.push(candidates[0]);
      selectable.push(fallbackGroupName);
      for (var j = 1; j < candidates.length; j++) {
        selectable.push(candidates[j]);
      }
    } else {
      selectable.push(fallbackGroupName);
    }

    newGroups.push(fallbackGroup);
    newGroups.push({
      name: groupName,
      type: "select",
      proxies: selectable
    });

    config["proxy-groups"] = newGroups;
  }

  function optimizeRuntime() {
    config.profile = config.profile || {};
    config.profile["store-selected"] = true;
    config.profile["store-fake-ip"] = true;

    config["geo-auto-update"] = true;
    config["geo-update-interval"] = 24;
    if (!config["global-client-fingerprint"]) {
      config["global-client-fingerprint"] = "chrome";
    }

    config.tun = config.tun || {};
    config.tun["auto-detect-interface"] = true;
    delete config.tun.AutoDetectInterface;
    config.tun["dns-hijack"] = mergeUnique(config.tun["dns-hijack"], [
      "any:53",
      "tcp://any:53"
    ]);

    config.sniffer = config.sniffer || {};
    config.sniffer.enable = true;
    config.sniffer["force-dns-mapping"] = true;
    config.sniffer["parse-pure-ip"] = true;
    config.sniffer.sniff = {
      HTTP: {
        ports: [80, "8080-8880"],
        "override-destination": true
      },
      TLS: {
        ports: [443, 8443]
      },
      QUIC: {
        ports: [443, 8443]
      }
    };
    config.sniffer["skip-domain"] = mergeUnique(
      config.sniffer["skip-domain"],
      ["+.lan", "+.local"]
    );
  }

  function optimizeDns() {
    var dns = config.dns || {};
    var domesticDns = [
      "https://dns.alidns.com/dns-query",
      "https://doh.pub/dns-query"
    ];
    var overseasDns = [
      "https://1.1.1.1/dns-query",
      "https://8.8.8.8/dns-query"
    ];
    var openAiDomains = [
      "+.openai.com",
      "+.chatgpt.com",
      "+.oaistatic.com",
      "+.oaiusercontent.com",
      "+.oaistatsig.com"
    ];

    dns.enable = true;
    dns.ipv6 = false;
    dns["enhanced-mode"] = "fake-ip";
    dns["cache-algorithm"] = "arc";
    dns["respect-rules"] = true;
    dns["default-nameserver"] = ["223.5.5.5", "119.29.29.29"];
    dns.nameserver = domesticDns;
    dns.fallback = overseasDns;
    dns["proxy-server-nameserver"] = domesticDns;
    dns["fake-ip-filter"] = mergeUnique(dns["fake-ip-filter"], [
      "+.lan",
      "+.local"
    ]);

    dns["fallback-filter"] = dns["fallback-filter"] || {};
    dns["fallback-filter"].geoip = true;
    dns["fallback-filter"]["geoip-code"] = "CN";
    dns["fallback-filter"].domain = mergeUnique(
      dns["fallback-filter"].domain,
      openAiDomains
    );

    dns["nameserver-policy"] = dns["nameserver-policy"] || {};
    for (var i = 0; i < openAiDomains.length; i++) {
      dns["nameserver-policy"][openAiDomains[i]] = overseasDns.slice();
    }

    config.dns = dns;
  }

  function buildRules() {
    var privateRules = [
      "DOMAIN-SUFFIX,lan,DIRECT",
      "DOMAIN-SUFFIX,local,DIRECT",
      "IP-CIDR,127.0.0.0/8,DIRECT,no-resolve",
      "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
      "IP-CIDR,172.16.0.0/12,DIRECT,no-resolve",
      "IP-CIDR,192.168.0.0/16,DIRECT,no-resolve",
      "IP-CIDR,100.64.0.0/10,DIRECT,no-resolve",
      "IP-CIDR6,::1/128,DIRECT,no-resolve",
      "IP-CIDR6,fc00::/7,DIRECT,no-resolve",
      "IP-CIDR6,fe80::/10,DIRECT,no-resolve"
    ];
    var suffixes = [
      "openai.com",
      "chatgpt.com",
      "oaistatic.com",
      "oaiusercontent.com",
      "oaistatsig.com",
      "ct.sendgrid.net",
      "intercom.io",
      "intercomcdn.com"
    ];
    var exactDomains = [
      "cdn.openaimerge.com",
      "cdn.workos.com",
      "challenges.cloudflare.com",
      "forwarder.workos.com",
      "humb.apple.com",
      "images.workoscdn.com",
      "js.stripe.com",
      "o207216.ingest.sentry.io",
      "o33249.ingest.sentry.io",
      "rum.browser-intake-datadoghq.com",
      "setup.workos.com",
      "workos.imgix.net"
    ];
    var managedPrivateKeys = {};
    var newRules = [];
    var seen = {};

    function addRule(rule) {
      var key = rule.toLowerCase();
      if (!seen[key]) {
        seen[key] = true;
        newRules.push(rule);
      }
    }

    for (var i = 0; i < privateRules.length; i++) {
      addRule(privateRules[i]);
      var privateParts = privateRules[i].split(",");
      managedPrivateKeys[(privateParts[0] + "," + privateParts[1]).toLowerCase()] = true;
    }
    for (var j = 0; j < suffixes.length; j++) {
      addRule("DOMAIN-SUFFIX," + suffixes[j] + "," + groupName);
    }
    for (var k = 0; k < exactDomains.length; k++) {
      addRule("DOMAIN," + exactDomains[k] + "," + groupName);
    }

    var oldRules = Array.isArray(config.rules) ? config.rules : [];
    for (var n = 0; n < oldRules.length; n++) {
      var rule = oldRules[n];
      if (typeof rule !== "string") {
        newRules.push(rule);
        continue;
      }

      var parts = rule.split(",");
      var type = (parts[0] || "").trim().toUpperCase();
      var value = (parts[1] || "").trim().toLowerCase();
      var target = (parts[2] || "").trim();
      var pairKey = (type + "," + value).toLowerCase();
      var isOldManagedTarget =
        target === groupName || target === fallbackGroupName;
      var isOldOpenAiRule =
        (type.indexOf("DOMAIN") === 0 &&
          (/openai|chatgpt|oaistatic|oaiusercontent|oaistatsig/.test(value))) ||
        (type === "DOMAIN-KEYWORD" && /openai|chatgpt/.test(value));

      if (
        isOldManagedTarget ||
        isOldOpenAiRule ||
        managedPrivateKeys[pairKey]
      ) {
        continue;
      }
      addRule(rule);
    }

    config.rules = newRules;
  }

  buildProxyGroups();
  optimizeRuntime();
  optimizeDns();
  buildRules();

  return config;
}
