// 远程脚本地址：https://raw.githubusercontent.com/smartzheng/flclash-script/refs/heads/main/rules.js
// GPT 支持地区来源：https://help.openai.com/en/articles/7947663
// FLClash / Mihomo 覆写脚本
// 目标：让 ChatGPT、Codex 及其登录/附件请求保持同一代理组，减少出口漂移、DNS 误解析和流式连接重建。
// 说明：脚本不会主动开启 TUN，也不会强制开启嗅探；这两项保留 FLClash 当前设置，避免影响 Git、公司内网和其他应用。
function main(config) {
  config = config || {};

  // ChatGPT 是手动选择入口；真正给 GPT/Codex 流量使用的是 fallback 组。
  // 这样节点故障时会自动切换，健康时又不会因为 url-test 的小幅延迟波动频繁换出口。
  var groupName = "ChatGPT";
  var fallbackGroupName = "ChatGPT-故障转移";
  var routeGroupName = fallbackGroupName;
  // 未携带 API Key 的 401 是预期结果，只用来确认 OpenAI 链路可达。
  var healthCheckUrl = "https://api.openai.com/v1/models";
  var healthCheckExpectedStatus = 401;
  // 0 表示保留全部符合地区和传输条件的节点；如果订阅节点非常多，可改成 20/30。
  var maxGptNodes = 0;

  // 公司内网必须直连，由 Windows/公司 DNS 解析。
  var directDomainSuffixes = ["xwfintech.com"];

  // OpenAI 的官方支持列表覆盖很多国家/地区。节点订阅通常只写两位国家码、
  // 英文国家名或国旗，因此三种写法都纳入；中国大陆、香港、澳门、俄罗斯等
  // 不在当前列表中的地区由 excludedNodePattern 明确排除。
  //
  // 这是“按节点名筛选”，不是对出口 IP 做地理定位。若节点名不含地区信息，
  // 它不会被猜测放入 GPT 组，以免把未知出口带进故障转移链路。
  var gptSupportedRegionCodes = [
    "AF", "AL", "DZ", "AX", "AD", "AO", "AG", "AR", "AM", "AW", "AU", "AT", "AZ", "BS", "BH",
    "BD", "BB", "BE", "BZ", "BM", "BJ", "BT", "BO", "BA", "BW", "BR", "BN", "BG",
    "BF", "BI", "CV", "KH", "CM", "CA", "KY", "CF", "TD", "CL", "CO", "KM", "CG", "CD", "CR",
    "CI", "HR", "CY", "CZ", "DK", "DJ", "DM", "DO", "EC", "EG", "SV", "GQ",
    "ER", "EE", "SZ", "ET", "FO", "FJ", "FI", "FR", "GF", "PF", "TF", "GA", "GM", "GE", "DE", "GH",
    "GR", "GD", "GL", "GT", "GN", "GW", "GY", "HT", "VA", "HN", "HU", "IS",
    "IN", "ID", "IQ", "IE", "IL", "IT", "JM", "JP", "JO", "KZ", "KE", "KI",
    "KW", "KG", "LA", "LV", "LB", "LS", "LR", "LY", "LI", "LT", "LU", "MG",
    "MW", "MY", "MV", "ML", "MT", "MH", "MQ", "MR", "MU", "YT", "MX", "FM", "MD",
    "MC", "MN", "ME", "MA", "MZ", "MM", "NA", "NR", "NP", "NL", "NC", "NZ", "NI",
    "NE", "NG", "MK", "NO", "OM", "PK", "PW", "PS", "PA", "PG", "PY", "PE",
    "PH", "PL", "PT", "QA", "RO", "RW", "KN", "LC", "VC", "WS", "SM", "ST",
    "SA", "SN", "RS", "SC", "SL", "SG", "SK", "SI", "SB", "SO", "ZA", "KR",
    "ES", "LK", "SR", "SE", "CH", "TJ", "TZ", "TW", "TH", "TL", "TG", "TO",
    "TT", "TN", "TR", "TM", "TV", "UG", "UA", "AE", "GB", "US", "UY", "UZ",
    "VU", "VN", "YE", "ZM", "ZW"
  ];
  var gptSupportedRegionAliases = [
    "台湾", "台灣", "Taiwan", "日本", "东京", "東京", "Japan", "韩国", "韓國", "South Korea",
    "新加坡", "Singapore", "美国", "美國", "United States", "USA", "加拿大", "Canada",
    "英国", "英國", "United Kingdom", "德国", "Germany", "法国", "France", "荷兰", "荷蘭",
    "Netherlands", "澳大利亚", "澳洲", "Australia", "新西兰", "New Zealand", "印度", "India",
    "印度尼西亚", "印尼", "Indonesia", "马来西亚", "Malaysia", "泰国", "泰國", "Thailand",
    "越南", "Vietnam", "菲律宾", "Philippines", "柬埔寨", "Cambodia", "老挝", "Laos",
    "以色列", "Israel", "土耳其", "Turkey", "阿联酋", "UAE", "沙特", "Saudi Arabia",
    "瑞士", "Switzerland", "奥地利", "Austria", "比利时", "Belgium", "爱尔兰", "Ireland",
    "意大利", "Italy", "西班牙", "Spain", "葡萄牙", "Portugal", "波兰", "Poland", "捷克",
    "Czechia", "Czech", "芬兰", "Finland", "瑞典", "Sweden", "丹麦", "Denmark", "挪威",
    "Norway", "巴西", "Brazil", "墨西哥", "Mexico", "南非", "South Africa", "乌克兰",
    "Ukraine", "哈萨克斯坦", "Kazakhstan", "蒙古", "Mongolia", "罗马尼亚", "Romania",
    "保加利亚", "Bulgaria", "克罗地亚", "Croatia", "希腊", "Greece", "冰岛", "Iceland",
    "塞尔维亚", "Serbia", "斯洛伐克", "Slovakia", "斯洛文尼亚", "Slovenia", "马耳他", "Malta",
    "卢森堡", "Luxembourg", "爱沙尼亚", "Estonia", "拉脱维亚", "Latvia", "立陶宛", "Lithuania",
    "阿尔巴尼亚", "Albania", "格鲁吉亚", "Georgia", "亚美尼亚", "Armenia", "阿塞拜疆", "Azerbaijan",
    "巴林", "Bahrain", "科威特", "Kuwait", "阿曼", "Oman", "卡塔尔", "Qatar", "约旦", "Jordan",
    "埃及", "Egypt", "摩洛哥", "Morocco", "尼日利亚", "Nigeria", "肯尼亚", "Kenya", "加纳", "Ghana"
  ];
  var gptSupportedRegionFlags = [
    "🇯🇵", "🇹🇼", "🇰🇷", "🇸🇬", "🇺🇸", "🇨🇦", "🇬🇧", "🇩🇪", "🇫🇷", "🇳🇱", "🇦🇺", "🇳🇿",
    "🇮🇳", "🇮🇩", "🇲🇾", "🇹🇭", "🇻🇳", "🇵🇭", "🇮🇱", "🇹🇷", "🇦🇪", "🇸🇦", "🇮🇹", "🇪🇸",
    "🇵🇹", "🇨🇭", "🇦🇹", "🇧🇪", "🇮🇪", "🇸🇪", "🇳🇴", "🇩🇰", "🇫🇮", "🇵🇱", "🇨🇿", "🇧🇷",
    "🇲🇽", "🇿🇦", "🇺🇦", "🇷🇴", "🇬🇷", "🇭🇺", "🇮🇸", "🇦🇷", "🇨🇱", "🇨🇴"
  ];
  var excludedNodePattern =
    /香港|Hong.?Kong|\bHK\b|🇭🇰|澳门|澳門|Macau|\bMO\b|🇲🇴|中国|大陆|大陸|China|\bCN\b|🇨🇳|俄罗斯|俄羅斯|Russia|\bRU\b|🇷🇺|白俄罗斯|Belarus|\bBY\b|剩余|剩餘|流量|套餐|到期|过期|過期|有效期|重置|expire|expired|traffic|quota|官网|官網|官方|订阅|訂閱|subscription|测试|測試|(?:^|[\s_-])test(?:$|[\s_-])|测速|測速|直连|直連|DIRECT|REJECT/i;
  var metadataNodePattern =
    /剩余|剩餘|流量|套餐|到期|过期|過期|有效期|重置|expire|expired|traffic|quota|官网|官網|官方|订阅|訂閱|subscription|测试|測試|(?:^|[\s_-])test(?:$|[\s_-])|测速|測速|直连|直連/i;

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function makeRegionPattern() {
    var aliases = gptSupportedRegionAliases.concat(gptSupportedRegionFlags);
    var aliasSource = aliases.map(escapeRegex).join("|");
    // 国家码必须位于非英文字母边界，避免把 IE 命中 IEPL、把 IN 命中 SINGAPORE。
    var codeSource = gptSupportedRegionCodes
      .map(function (code) {
        return "(^|[^A-Za-z])" + escapeRegex(code) + "(?=$|[^A-Za-z])";
      })
      .join("|");
    return new RegExp(aliasSource + "|" + codeSource, "i");
  }

  var gptSupportedRegionPattern = makeRegionPattern();
  // Mihomo 的 include-all/filter 使用 RE2，不能使用 JS 的 lookahead；这里使用
  // 常见地区名称/码作为无 lookahead 的兜底筛选，正常情况下仍优先使用静态节点名。
  var gptRegionFilterPattern =
    "(?i)(台湾|台灣|Taiwan|JP|Japan|日本|东京|東京|TW|KR|South Korea|韩国|韓國|SG|Singapore|新加坡|US|USA|United States|美国|美國|CA|Canada|加拿大|GB|UK|United Kingdom|英国|英國|DE|Germany|德国|FR|France|法国|NL|Netherlands|荷兰|荷蘭|AU|Australia|澳大利亚|澳洲|NZ|New Zealand|新西兰|IN|India|印度|MY|Malaysia|马来西亚|TH|Thailand|泰国|泰國|VN|Vietnam|越南|PH|Philippines|菲律宾|IL|Israel|以色列|TR|Turkey|土耳其|AE|UAE|阿联酋|BR|Brazil|巴西|MX|Mexico|墨西哥|ZA|South Africa|南非|IT|Italy|意大利|ES|Spain|西班牙|PT|Portugal|葡萄牙|CH|Switzerland|瑞士|AT|Austria|奥地利|BE|Belgium|比利时|IE|Ireland|爱尔兰|SE|Sweden|瑞典|NO|Norway|挪威|DK|Denmark|丹麦|FI|Finland|芬兰|PL|Poland|波兰|CZ|Czech|捷克|RO|Romania|罗马尼亚|UA|Ukraine|乌克兰|🇯🇵|🇹🇼|🇰🇷|🇸🇬|🇺🇸|🇨🇦|🇬🇧|🇩🇪|🇫🇷|🇳🇱|🇦🇺|🇳🇿|🇮🇳|🇲🇾|🇹🇭|🇻🇳|🇵🇭|🇮🇱|🇹🇷|🇦🇪|🇧🇷|🇲🇽|🇿🇦)";

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
  // 登录或风控校验可能在主聊天链路之外发起；与 ChatGPT 保持同一出口，
  // 避免 Cloudflare / Arkose 将验证状态判定为跨地区或跨 IP。
  var openAiExactDomains = [
    "challenges.cloudflare.com",
    "client-api.arkoselabs.com",
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
    if (!gptSupportedRegionPattern.test(name)) {
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
    var fallbackNodes = maxGptNodes > 0
      ? candidates.slice(0, maxGptNodes)
      : candidates.slice();
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
      fallbackGroup.filter = gptRegionFilterPattern;
      fallbackGroup["exclude-filter"] =
        "(?i)(香港|Hong.?Kong|HK|🇭🇰|澳门|澳門|Macau|MO|🇲🇴|中国|大陆|大陸|China|CN|🇨🇳|俄罗斯|俄羅斯|Russia|RU|🇷🇺|白俄罗斯|Belarus|BY|剩余|剩餘|流量|套餐|到期|过期|過期|有效期|重置|expire|expired|traffic|quota|官网|官網|官方|订阅|訂閱|subscription|测试|測試|test|测速|測速|直连|直連)";
      fallbackGroup["exclude-type"] = "(?i)(Hysteria|Hysteria2|TUIC|WireGuard)";
    }

    // 手动入口默认落到故障转移组；GPT/Codex 域名和进程规则也直接指向该组。
    // fallback 只在连续 3 次健康检查失败后才切换，避免轻微抖动触发出口漂移。
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
      "+.intercomcdn.com",
      "challenges.cloudflare.com",
      "client-api.arkoselabs.com"
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
      addRule("PROCESS-NAME," + appProcessNames[appIndex] + "," + routeGroupName);
      managedProcesses[appProcessNames[appIndex].toLowerCase()] = true;
    }
    for (var suffixIndex = 0; suffixIndex < openAiSuffixes.length; suffixIndex++) {
      addRule("DOMAIN-SUFFIX," + openAiSuffixes[suffixIndex] + "," + routeGroupName);
    }
    for (var exactIndex = 0; exactIndex < openAiExactDomains.length; exactIndex++) {
      addRule("DOMAIN," + openAiExactDomains[exactIndex] + "," + routeGroupName);
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
