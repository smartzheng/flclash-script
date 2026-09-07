// 远程脚本地址：https://raw.githubusercontent.com/smartzheng/flclash-script/refs/heads/main/rules.js
// FLClash / Mihomo 覆写脚本
// 目标：让 ChatGPT、Codex 及其登录/附件请求保持同一代理组，减少出口漂移、DNS 误解析和流式连接重建。
// 说明：脚本不会主动开启 TUN，也不会强制开启嗅探；这两项保留 FLClash 当前设置，避免影响 Git、公司内网和其他应用。
function main(config) {
  config = config || {};

  var groupName = "ChatGPT";
  var fallbackGroupName = "ChatGPT-故障转移";
  // 未携带 API Key 的 401 是预期结果，只用来确认 OpenAI 链路可达。
  var healthCheckUrl = "https://api.openai.com/v1/models";
  var healthCheckExpectedStatus = 401;

  // 公司内网必须直连，由 Windows/公司 DNS 解析。
  var directDomainSuffixes = ["xwfintech.com"];

  // 只把明确的境外节点放入 ChatGPT 组，避免把中国大陆、香港、澳门或订阅信息误当成节点。
  var overseasRegionPattern =
    /台湾|台灣|Taiwan|\bTW\b|日本|東京|东京|Japan|\bJP\b|韩国|韓國|Korea|\bKR\b|新加坡|Singapore|\bSG\b|美国|美國|United.?States|\bUS\b|加拿大|Canada|\bCA\b|英国|英國|United.?Kingdom|\bUK\b|\bGB\b|德国|Germany|\bDE\b|法国|France|\bFR\b|荷兰|荷蘭|Netherlands|\bNL\b|澳大利亚|澳洲|Australia|\bAU\b|印度|India|\bIN\b|土耳其|Turkey|越南|Vietnam|泰国|泰國|Thailand|菲律宾|Philippines|马来西亚|Malaysia|印尼|Indonesia|瑞士|Switzerland|奥地利|Austria|俄罗斯|Russia|芬兰|Finland|瑞典|Sweden|丹麦|Denmark|挪威|Norway|西班牙|Spain|意大利|Italy|巴西|Brazil|墨西哥|Mexico|新西兰|New.?Zealand|波兰|Poland|捷克|Czech|爱尔兰|Ireland|以色列|Israel|南非|South.?Africa|阿联酋|UAE/i;
  var excludedNodePattern =
    /香港|Hong.?Kong|\bHK\b|澳门|澳門|Macau|\bMO\b|中国|大陆|大陸|China|\bCN\b|剩余|剩餘|流量|套餐|到期|过期|過期|有效期|重置|expire|expired|traffic|quota|官网|官網|官方|订阅|訂閱|subscription|测试|測試|(?:^|[\s_-])test(?:$|[\s_-])|测速|測速|直连|直連|DIRECT|REJECT/i;
  var metadataNodePattern =
    /剩余|剩餘|流量|套餐|到期|过期|過期|有效期|重置|expire|expired|traffic|quota|官网|官網|官方|订阅|訂閱|subscription|测试|測試|(?:^|[\s_-])test(?:$|[\s_-])|测速|測速|直连|直連/i;

  // OpenAI 核心、登录、静态资源和附件域名。不要把整个 googleapis.com 交给该组，
  // 其中很多是 Chromium 的推送/优化服务，与聊天主链路无关。
  var openAiSuffixes = [
    "openai.com",
    "chatgpt.com",
    "oaistatic.com",
    "oaiusercontent.com",
    "oaistatsig.com",
    "workos.com",
    "workoscdn.com",
    "intercom.io",
    "intercomcdn.com"
  ];
  var openAiExactDomains = [
    "cdn.openaimerge.com",
    "ct.sendgrid.net",
    "cdn.workos.com",
    "forwarder.workos.com",
    "setup.workos.com",
    "images.workoscdn.com",
    "workos.imgix.net",
    "o207216.ingest.sentry.io",
    "o33249.ingest.sentry.io"
  ];

  // 这些是桌面客户端/Chromium 的辅助连接，保持直连并置于进程规则之前，
  // 避免因为辅助服务不可达而拖慢主窗口。
  var directExactDomains = [
    "mtalk.google.com",
    "optimizationguide-pa.googleapis.com"
  ];

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
    var network = String((proxy && proxy.network) || "").toLowerCase();

    // ChatGPT/Codex 主要使用 HTTPS、SSE 和 WebSocket。排除容易出现 UDP/QUIC
    // 握手不一致的节点，但保留 SS、VMess、VLESS、Trojan、SOCKS 等 TCP 节点。
    if (/^(hysteria|hysteria2|tuic|wireguard)$/.test(type)) {
      return false;
    }
    if (/quic|http3/.test(network)) {
      return false;
    }
    return true;
  }

  function nodePriority(proxy, name) {
    var score = 1000;
    var network = String((proxy && proxy.network) || "").toLowerCase();

    if (proxy && (proxy["reality-opts"] || /vision/i.test(proxy.flow || ""))) {
      score -= 300;
    }
    if (/^tcp$/.test(network)) {
      score -= 140;
    } else if (/ws|grpc|http/.test(network)) {
      score -= 100;
    }
    if (proxy && Number(proxy.port) === 443) {
      score -= 70;
    }
    if (/专线|專線|IEPL|BGP|CN2|住宅|家宽|家寬|低延迟|低延遲|高带宽|高帶寬/i.test(name)) {
      score -= 55;
    }

    // 对中国大陆用户通常更适合的近端地区优先；排序是静态的，不会按每次请求换节点。
    if (/日本|東京|东京|Japan|\bJP\b/i.test(name)) {
      score -= 200;
    } else if (/台湾|台灣|Taiwan|\bTW\b/i.test(name)) {
      score -= 180;
    } else if (/韩国|韓國|Korea|\bKR\b/i.test(name)) {
      score -= 165;
    } else if (/新加坡|Singapore|\bSG\b/i.test(name)) {
      score -= 150;
    } else if (/加拿大|Canada|\bCA\b/i.test(name)) {
      score -= 105;
    } else if (/美国|美國|United.?States|\bUS\b/i.test(name)) {
      score -= 90;
    }

    // 当前脚本关闭 IPv6，名称中明确标注 IPv6 的节点只作为后备。
    if (/IPv6/i.test(name) && config.ipv6 === false) {
      score += 80;
    }
    // 低倍率节点通常更容易拥塞，稍微降低优先级。
    if (/0\.01x|0\.1x|0\.5x/i.test(name)) {
      score += 25;
    }
    return score;
  }

  function isCandidateProxy(proxy) {
    var name = proxy && proxy.name;
    if (typeof name !== "string" || !name) {
      return false;
    }
    if (metadataNodePattern.test(name) || excludedNodePattern.test(name)) {
      return false;
    }
    if (!overseasRegionPattern.test(name)) {
      return false;
    }
    return isTcpFriendlyProxy(proxy);
  }

  function getCandidateNodes() {
    var proxies = Array.isArray(config.proxies) ? config.proxies : [];
    var candidates = [];

    for (var i = 0; i < proxies.length; i++) {
      var proxy = proxies[i];
      if (isCandidateProxy(proxy)) {
        candidates.push({
          name: proxy.name,
          index: i,
          score: nodePriority(proxy, proxy.name)
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

  function optimizeExistingGroup(group) {
    if (!group || typeof group.type !== "string") {
      return;
    }
    var type = group.type.toLowerCase();
    if (type === "url-test") {
      // 防止轻微延迟波动导致频繁换 IP；只在明显改善时才换节点。
      group.interval = 900;
      group.timeout = 8000;
      group.lazy = true;
      group.tolerance = 100;
      group["max-failed-times"] = 3;
    } else if (type === "fallback") {
      group.interval = 900;
      group.timeout = 8000;
      group.lazy = true;
      group["max-failed-times"] = 3;
    }
  }

  function buildProxyGroups() {
    var oldGroups = Array.isArray(config["proxy-groups"])
      ? config["proxy-groups"]
      : [];
    var newGroups = [];
    var seenGroupNames = {};

    for (var i = 0; i < oldGroups.length; i++) {
      var group = oldGroups[i];
      if (!group || typeof group.name !== "string") {
        continue;
      }
      if (group.name === groupName || group.name === fallbackGroupName) {
        continue;
      }
      if (seenGroupNames[group.name]) {
        continue;
      }
      seenGroupNames[group.name] = true;
      optimizeExistingGroup(group);
      newGroups.push(group);
    }

    var candidates = getCandidateNodes();
    var fallbackNodes = candidates.slice(0, 12);
    var fallbackGroup = {
      name: fallbackGroupName,
      type: "fallback",
      url: healthCheckUrl,
      interval: 900,
      timeout: 8000,
      lazy: true,
      "max-failed-times": 3,
      "expected-status": healthCheckExpectedStatus,
      "disable-udp": true,
      hidden: false
    };

    if (fallbackNodes.length > 0) {
      fallbackGroup.proxies = fallbackNodes;
    } else {
      // 没有可静态识别的节点时交给 Mihomo 动态筛选，避免脚本生成空组。
      fallbackGroup["include-all"] = true;
      fallbackGroup.filter =
        "(?i)(台湾|台灣|Taiwan|TW|日本|東京|东京|Japan|JP|韩国|韓國|Korea|KR|新加坡|Singapore|SG|美国|美國|United.?States|US|加拿大|Canada|CA|英国|英國|United.?Kingdom|UK|GB|德国|Germany|DE|法国|France|FR|荷兰|荷蘭|Netherlands|NL|澳大利亚|澳洲|Australia|AU|印度|India|IN)";
      fallbackGroup["exclude-filter"] =
        "(?i)(香港|Hong.?Kong|HK|澳门|澳門|Macau|MO|中国|大陆|大陸|China|CN|剩余|剩餘|流量|套餐|到期|过期|過期|有效期|重置|expire|expired|traffic|quota|官网|官網|官方|订阅|訂閱|subscription|测试|測試|test|测速|測速|直连|直連)";
      fallbackGroup["exclude-type"] = "(?i)(Hysteria|Hysteria2|TUIC|WireGuard)";
    }

    // ChatGPT 组默认固定到排序第一的节点，避免每次打开聊天都变更出口 IP。
    // 需要自动恢复时手动选择 ChatGPT-故障转移；它只在连续 3 次健康检查失败后切换。
    var selectable = [];
    if (candidates.length > 0) {
      selectable.push(candidates[0]);
    }
    selectable.push(fallbackGroupName);
    for (var j = 0; j < candidates.length; j++) {
      pushUnique(selectable, candidates[j]);
    }

    newGroups.push(fallbackGroup);
    newGroups.push({
      name: groupName,
      type: "select",
      "disable-udp": true,
      proxies: selectable
    });
    config["proxy-groups"] = newGroups;
  }

  function optimizeRuntime() {
    config.profile = config.profile || {};
    // 保存用户手动选择，避免重启后回到另一出口。
    config.profile["store-selected"] = true;

    // OpenAI 客户端的主链路是 TCP；统一关闭 IPv6 可避免 AAAA 解析到不可达地址。
    config.ipv6 = false;
    config["tcp-concurrent"] = true;
    config["disable-keep-alive"] = false;
    config["keep-alive-interval"] = 30;
    if (!config["global-client-fingerprint"]) {
      config["global-client-fingerprint"] = "chrome";
    }

    // 不主动开启 TUN。若用户已经开启 TUN，只补齐稳定所需的路由/DNS 劫持参数。
    config.tun = config.tun || {};
    if (config.tun.enable === true) {
      config.tun.stack = config.tun.stack || "mixed";
      config.tun["auto-route"] = true;
      config.tun["auto-detect-interface"] = true;
      config.tun["dns-hijack"] = mergeUnique(config.tun["dns-hijack"], [
        "any:53",
        "tcp://any:53"
      ]);
    }

    // 保留用户现有嗅探开关。脚本不强制开启 sniff/override-destination，
    // 以免 TUN 下改变 TLS 目的地导致 Git 或企业内网出现 EOF。
    config.sniffer = config.sniffer || {};
    if (typeof config.sniffer.enable !== "boolean") {
      config.sniffer.enable = false;
    }
    config.sniffer["skip-domain"] = mergeUnique(
      config.sniffer["skip-domain"],
      ["+.lan", "+.local"].concat(
        directDomainSuffixes.map(function (domain) {
          return "+." + domain;
        })
      )
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
    var openAiPolicies = [
      "+.openai.com",
      "+.chatgpt.com",
      "+.oaistatic.com",
      "+.oaiusercontent.com",
      "+.oaistatsig.com",
      "+.workos.com",
      "+.workoscdn.com",
      "+.intercom.io",
      "+.intercomcdn.com"
    ];

    dns.enable = true;
    dns.ipv6 = false;
    dns["respect-rules"] = true;
    // respect-rules 与 DoH over HTTP/3 组合容易增加握手失败，保持 DoH over TCP/TLS。
    dns["prefer-h3"] = false;
    // 只在主 DNS 无法得到有效结果时查询 fallback，减少切换窗口时的并发 DNS 等待。
    dns["fallback-lazy-query"] = true;
    if (!dns["enhanced-mode"]) {
      dns["enhanced-mode"] = "fake-ip";
    }
    if (!dns["cache-algorithm"]) {
      dns["cache-algorithm"] = "lru";
    }
    dns["default-nameserver"] = ["223.5.5.5", "119.29.29.29"];
    dns.nameserver = domesticDns;
    dns.fallback = overseasDns;
    // 代理服务器自身的域名用国内 bootstrap 解析，避免启动时形成 DNS 环路。
    dns["proxy-server-nameserver"] = domesticDns.slice();
    dns["direct-nameserver"] = domesticDns.slice();
    dns["direct-nameserver-follow-policy"] = true;

    dns["fake-ip-filter"] = mergeUnique(dns["fake-ip-filter"], [
      "+.lan",
      "+.local",
      "localhost.ptlogin2.qq.com"
    ].concat(
      directDomainSuffixes.map(function (domain) {
        return "+." + domain;
      })
    ));

    dns["fallback-filter"] = dns["fallback-filter"] || {};
    dns["fallback-filter"].geoip = true;
    dns["fallback-filter"]["geoip-code"] = "CN";
    dns["fallback-filter"].domain = mergeUnique(
      dns["fallback-filter"].domain,
      openAiPolicies
    );

    if (!dns["nameserver-policy"] || Array.isArray(dns["nameserver-policy"])) {
      dns["nameserver-policy"] = {};
    }
    for (var i = 0; i < openAiPolicies.length; i++) {
      dns["nameserver-policy"][openAiPolicies[i]] = overseasDns.slice();
    }
    for (var directIndex = 0; directIndex < directDomainSuffixes.length; directIndex++) {
      dns["nameserver-policy"]["+." + directDomainSuffixes[directIndex]] = ["system"];
    }
    config.dns = dns;
  }

  function buildRules() {
    // 进程规则是 TUN/进程识别可用时的兜底；域名规则负责系统代理模式。
    var appProcessNames = [
      "ChatGPT.exe",
      "ChatGPT Helper.exe",
      "codex.exe",
      "Codex Helper.exe"
    ];
    var privateRules = [
      "DOMAIN-SUFFIX,xwfintech.com,DIRECT",
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
    var directRules = directExactDomains.map(function (domain) {
      return "DOMAIN," + domain + ",DIRECT";
    });
    var managedPrivateKeys = {};
    var managedExact = {};
    var managedProcesses = {};
    var newRules = [];
    var terminalRules = [];
    var terminalSeen = {};
    var seen = {};

    function addRule(rule) {
      if (typeof rule !== "string") {
        return;
      }
      var key = rule.toLowerCase();
      if (!seen[key]) {
        seen[key] = true;
        newRules.push(rule);
      }
    }

    for (var i = 0; i < privateRules.length; i++) {
      addRule(privateRules[i]);
      var privateParts = privateRules[i].split(",");
      managedPrivateKeys[
        (privateParts[0] + "," + privateParts[1]).toLowerCase()
      ] = true;
    }
    for (var directIndex = 0; directIndex < directRules.length; directIndex++) {
      addRule(directRules[directIndex]);
      managedExact[directExactDomains[directIndex].toLowerCase()] = true;
    }
    for (var appIndex = 0; appIndex < appProcessNames.length; appIndex++) {
      addRule("PROCESS-NAME," + appProcessNames[appIndex] + "," + groupName);
      managedProcesses[appProcessNames[appIndex].toLowerCase()] = true;
    }
    for (var suffixIndex = 0; suffixIndex < openAiSuffixes.length; suffixIndex++) {
      addRule("DOMAIN-SUFFIX," + openAiSuffixes[suffixIndex] + "," + groupName);
    }
    for (var exactIndex = 0; exactIndex < openAiExactDomains.length; exactIndex++) {
      addRule("DOMAIN," + openAiExactDomains[exactIndex] + "," + groupName);
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
      var processName = type === "PROCESS-NAME" ? value : "";
      var isTerminal = type === "MATCH" || type === "FINAL";
      var isOldManagedTarget =
        target === groupName || target === fallbackGroupName;
      var isOldOpenAiRule =
        type.indexOf("DOMAIN") === 0 &&
        (/openai|chatgpt|oaistatic|oaiusercontent|oaistatsig|workos|intercom/.test(
          value
        ) || managedExact[value]);
      var isManagedAppProcessRule = !!managedProcesses[processName];

      if (isTerminal) {
        if (!terminalSeen[rule.toLowerCase()]) {
          terminalSeen[rule.toLowerCase()] = true;
          terminalRules.push(rule);
        }
        continue;
      }
      if (
        isOldManagedTarget ||
        isOldOpenAiRule ||
        isManagedAppProcessRule ||
        managedPrivateKeys[pairKey]
      ) {
        continue;
      }
      addRule(rule);
    }

    // MATCH/FINAL 必须最后执行，避免挡住上面的 OpenAI 和内网规则。
    for (var terminalIndex = 0; terminalIndex < terminalRules.length; terminalIndex++) {
      addRule(terminalRules[terminalIndex]);
    }
    config.rules = newRules;
  }

  // 先统一运行时/DNS 开关，再按最终 IPv6 状态排序节点并生成规则。
  optimizeRuntime();
  optimizeDns();
  buildProxyGroups();
  buildRules();

  return config;
}
