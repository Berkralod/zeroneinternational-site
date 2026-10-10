"use strict";
(function(){
  document.querySelectorAll("[data-carousel]").forEach(function(region){
    var cards=Array.from(region.querySelectorAll("[data-scenario]"));
    if(!cards.length)return;
    var controls=region.querySelector("[data-carousel-controls]");
    var count=region.querySelector("[data-count]");
    var play=region.querySelector("[data-play]");
    var index=0,timer=null;
    var reduced=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var playing=!reduced;
    var list=region.querySelector("[data-card-list]");
    list.classList.remove("services");
    function render(){
      cards.forEach(function(card,i){card.hidden=i!==index;});
      count.textContent=(index+1)+" / "+cards.length;
      play.textContent=playing?"Pause rotation":"Start rotation";
      count.setAttribute("aria-live",playing?"off":"polite");
    }
    function schedule(){
      if(timer){clearInterval(timer);timer=null;}
      if(playing&&!document.hidden){timer=setInterval(function(){index=(index+1)%cards.length;render();},7000);}
    }
    function pause(){playing=false;schedule();render();}
    region.querySelector("[data-prev]").addEventListener("click",function(){pause();index=(index-1+cards.length)%cards.length;render();});
    region.querySelector("[data-next]").addEventListener("click",function(){pause();index=(index+1)%cards.length;render();});
    play.addEventListener("click",function(){playing=!playing;schedule();render();});
    list.addEventListener("mouseenter",pause);
    list.addEventListener("touchstart",pause,{passive:true});
    controls.addEventListener("focusin",function(event){if(event.target!==play)pause();});
    document.addEventListener("visibilitychange",schedule);
    controls.hidden=false;render();schedule();
  });
})();
