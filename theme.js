"use strict";
(function(){
  var root=document.documentElement;
  var key="zerone-theme";
  var preference=null;
  try{preference=localStorage.getItem(key);}catch(error){}
  var media=window.matchMedia?window.matchMedia("(prefers-color-scheme: light)"):null;
  var theme=(preference==="light"||preference==="dark")?preference:((media&&media.matches)?"light":"dark");
  var buttons=document.querySelectorAll("[data-theme-toggle]");
  function apply(value){
    theme=value;
    root.setAttribute("data-theme",value);
    buttons.forEach(function(button){
      button.textContent=value==="dark"?(button.getAttribute("data-light-label")||"Light mode"):(button.getAttribute("data-dark-label")||"Dark mode");
      button.setAttribute("aria-label",button.textContent);
    });
  }
  apply(theme);
  buttons.forEach(function(button){
    button.addEventListener("click",function(){
      preference=theme==="dark"?"light":"dark";
      apply(preference);
      try{localStorage.setItem(key,preference);}catch(error){}
    });
  });
  if(media&&media.addEventListener){media.addEventListener("change",function(event){if(preference!=="light"&&preference!=="dark"){apply(event.matches?"light":"dark");}});}
  if(buttons.length){
    var languageStyle=document.createElement("link");
    languageStyle.rel="stylesheet";
    languageStyle.href="languages.css?v=1";
    document.head.appendChild(languageStyle);
    var picker=document.createElement("select");
    picker.className="theme-toggle";
    var labels={"en": "Language", "tr": "Dil", "de": "Sprache", "es": "Idioma", "fr": "Langue", "it": "Lingua", "pt": "Idioma", "ar": "اللغة", "hi": "भाषा", "zh": "语言", "ja": "言語", "nl": "Taal", "pl": "Język", "ru": "Язык", "uk": "Мова"};
    picker.setAttribute("aria-label",labels[root.lang]||labels.en);
    var languages=[["en", "English", "index.html"], ["tr", "Türkçe", "tr.html"], ["de", "Deutsch", "de.html"], ["es", "Español", "es.html"], ["fr", "Français", "fr.html"], ["it", "Italiano", "it.html"], ["pt", "Português", "pt.html"], ["ar", "العربية", "ar.html"], ["hi", "हिन्दी", "hi.html"], ["zh", "中文", "zh.html"], ["ja", "日本語", "ja.html"], ["nl", "Nederlands", "nl.html"], ["pl", "Polski", "pl.html"], ["ru", "Русский", "ru.html"], ["uk", "Українська", "uk.html"]];
    languages.forEach(function(item){
      var option=document.createElement("option");
      option.value=item[2];option.textContent=item[1];option.lang=item[0];option.selected=root.lang===item[0];
      picker.appendChild(option);
    });
    picker.addEventListener("change",function(){window.location.assign(picker.value);});
    buttons[0].parentNode.appendChild(picker);
  }
})();
