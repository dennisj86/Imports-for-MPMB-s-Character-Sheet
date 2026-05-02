
var outcome = "";
if(isNaN(event.value) && event.value.indexOf(",") !== -1) {
	outcome = event.value.replace(",", ".") * 1
};
if(isNaN(outcome) || outcome < 0){event.rc=false};
