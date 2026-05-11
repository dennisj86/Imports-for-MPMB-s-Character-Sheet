
if (event.target.isBoxChecked(0) === 1) {
	RemoveString("Proficiencies Remember", "lightoff");
	AddString("Proficiencies Remember", "lighton");
} else {
	RemoveString("Proficiencies Remember", "lighton");
	AddString("Proficiencies Remember", "lightoff");
}
