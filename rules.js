const checkVacRules = (settings, data) => {
    try {
        let vaccineType = data.mp;
        let doseNumber = data.dn;
        let dateOfVaccination = data.dt;
        let totalSeriesOfDoses = data.sd;
        let now = new Date().getTime();

        //XXX aggiungere gestione degli errori. 

        if (doseNumber < totalSeriesOfDoses) {
            let vaccine_start_day_not_complete = settings.find(rule => {
                return rule.name == 'vaccine_start_day_not_complete' && rule.type == vaccineType
            })
            let vaccine_end_day_not_complete = settings.find(rule => {
                return rule.name == 'vaccine_end_day_not_complete' && rule.type == vaccineType
            })

            let startDate = new Date(dateOfVaccination);
            startDate.setDate(startDate.getDate() + parseInt(vaccine_start_day_not_complete.value));
            let endDate = new Date(dateOfVaccination);
            endDate.setDate(endDate.getDate() + parseInt(vaccine_end_day_not_complete.value));

            if (startDate.getTime() > now || endDate.getTime() < now) {
                return false
            } else {
                return true
            }
        }

        if (doseNumber >= totalSeriesOfDoses) {
            let vaccine_start_day_complete = settings.find(rule => {
                return rule.name == 'vaccine_start_day_complete' && rule.type == vaccineType
            })
            let vaccine_end_day_complete = settings.find(rule => {
                return rule.name == 'vaccine_end_day_complete' && rule.type == vaccineType
            })

            let startDate = new Date(dateOfVaccination);
            startDate.setDate(startDate.getDate() + parseInt(vaccine_start_day_complete.value));
            let endDate = new Date(dateOfVaccination);
            endDate.setDate(endDate.getDate() + parseInt(vaccine_end_day_complete.value));

            if (startDate.getTime() > now || endDate.getTime() < now) {
                return false
            } else {
                return true
            }
        }
    } catch (e) {
        console.error('Error checking vaccine rules', e)
        return false;
    }

}

const DETECTED = "260373001";
const NOT_DETECTED = "260415000";

// https://ec.europa.eu/health/sites/default/files/ehealth/docs/digital-green-certificates_dt-specifications_en.pdf
const TYPE_RAPID = "LP217198-3"; 	// RAT, Rapid Antigen Test
const TYPE_MOLECULAR = "LP6464-4";	// NAAT, Nucleic Acid Amplification Test

const checkTestRules = function (settings, data) {
    let testType = data.tt;
    let testResult = data.tr;
    let dateTimeOfSampleCollection = data.sc;
    let now = new Date().getTime();

    // if result is Detected, green pass is not valid
    if (testResult == DETECTED) {
        return false;
    }

    try {

        let startDate;
        let endDate;

        if (testType == TYPE_RAPID) {
            let rapidTestStartHour = settings.find(rule => {
                return rule.name == 'rapid_test_start_hours'
            })
            let rapidTestEndHour = settings.find(rule => {
                return rule.name == 'rapid_test_end_hours'
            })

            startDate = new Date(dateTimeOfSampleCollection);
            startDate.setHours(startDate.getHours() + parseInt(rapidTestStartHour.value));

            endDate = new Date(dateTimeOfSampleCollection);
            endDate.setHours(endDate.getHours() + parseInt(rapidTestEndHour.value));

        } else if (testType == TYPE_MOLECULAR) {
            let molecularTestStartHour = settings.find(rule => {
                return rule.name == 'molecular_test_start_hours'
            })
            let molecularTestEndHour = settings.find(rule => {
                return rule.name == 'molecular_test_end_hours'
            })

            startDate = new Date(dateTimeOfSampleCollection);
            startDate.setHours(startDate.getHours() + parseInt(molecularTestStartHour.value));

            endDate = new Date(dateTimeOfSampleCollection);
            endDate.setHours(endDate.getHours() + parseInt(molecularTestEndHour.value));

        } else {
            console.error('type test unknown')
            return false; // Type test unknown
        }

        if (startDate.getTime() > now || endDate.getTime() < now) {
            return false
        } else {
            return true
        }

    } catch (e) {
        console.error('Error checking test rules', e)
        return false;
    }
}

const checkRecRules = function (settings, data) {
    try {
        let dateValidFrom = data.df;
        let dateValidUntil = data.du;
        let now = new Date().getTime();

        let startDate = new Date(dateValidFrom);
        let endDate = new Date(dateValidUntil);

        if (startDate.getTime() > now || endDate.getTime() < now) {
            return false
        } else {
            return true
        }
    } catch (error) {
        console.error('Errore checking recovery rules', e)
        return false;
    }
}

module.exports = {
    checkVacRules,
    checkTestRules,
    checkRecRules
}