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
    var languageLink=document.createElement("a");
    var isTurkish=root.lang==="tr";
    languageLink.className="theme-toggle";
    languageLink.href=isTurkish?"index.html":"tr.html";
    languageLink.textContent=isTurkish?"English":"Türkçe";
    languageLink.hreflang=isTurkish?"en":"tr";
    languageLink.lang=isTurkish?"en":"tr";
    languageLink.setAttribute("aria-label",isTurkish?"English homepage":"Türkçe ana sayfa");
    buttons[0].parentNode.appendChild(languageLink);
  }
})();
