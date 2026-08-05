function main(config) {

  var groupName = "ChatGPT";

  var oldGroups = config["proxy-groups"] || [];
  var newGroups = [];


  for (var i = 0; i < oldGroups.length; i++) {

    if (oldGroups[i].name !== groupName) {
      newGroups.push(oldGroups[i]);
    }

  }



  newGroups.push({

    name: groupName,

    type: "fallback",

    "include-all": true,

    filter:
      "(?i)(台湾|台灣|Taiwan|TW|日本|東京|东京|Japan|JP|新加坡|Singapore|SG)",

    "exclude-filter":
      "(?i)(香港|Hong.?Kong|HK|澳门|Macau|MO|剩余|剩餘|流量|套餐|到期|过期|有效期|重置|expire|expired|traffic|quota|官网|官方|测试|test|测速|直连)",

    url:
      "https://api.openai.com/",

    interval: 90,

    timeout: 5000,

    lazy: false

  });



  config["proxy-groups"] = newGroups;



  var domains = [

    "chatgpt.com",
    "chat.openai.com",
    "tcr9i.chat.openai.com",
    "openai.com",

    "api.openai.com",
    "backend-api.openai.com",

    "auth.openai.com",
    "auth0.openai.com",
    "login.openai.com",
    "setup.auth.openai.com",

    "android.chat.openai.com",
    "ios.chat.openai.com",
    "desktop.chat.openai.com",
    "ws.chatgpt.com",

    "oaiusercontent.com",
    "files.oaiusercontent.com",
    "files.openai.com",

    "oaistatic.com",
    "cdn.openai.com",
    "cdn.oaistatic.com",
    "cdn.openaimerge.com",

    "cdn.workos.com",
    "forwarder.workos.com",
    "setup.workos.com",
    "workos.imgix.net",
    "images.workoscdn.com",

    "challenges.cloudflare.com",

    "realtime.openai.com",
    "voice.openai.com",
    "rtc.openai.com",

    "oaistatsig.com",
    "statsigapi.net",

    "sentry.io",
    "datadoghq.com",
    "browser-intake-datadoghq.com",

    "intercom.io",
    "intercomcdn.com",
    "js.intercomcdn.com",

    "js.stripe.com",

    "ct.sendgrid.net",

    "accounts.google.com",
    "oauth2.googleapis.com",
    "googleapis.com"

  ];



  var newRules = [];


  for (var j = 0; j < domains.length; j++) {

    newRules.push(
      "DOMAIN-SUFFIX," + domains[j] + "," + groupName
    );

  }


  newRules.push(
    "DOMAIN-KEYWORD,chatgpt," + groupName
  );


  newRules.push(
    "DOMAIN-KEYWORD,openai," + groupName
  );



  var oldRules = config.rules || [];


  for (var k = 0; k < oldRules.length; k++) {

    var remove = false;


    if (typeof oldRules[k] === "string") {

      if (
        oldRules[k].indexOf("openai") !== -1 ||
        oldRules[k].indexOf("chatgpt") !== -1
      ) {

        remove = true;

      }

    }


    if (!remove) {

      newRules.push(oldRules[k]);

    }

  }



  config.rules = newRules;


  return config;

}
