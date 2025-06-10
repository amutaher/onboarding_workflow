frappe.ui.form.on('Employee', {
    refresh: function(frm) {
        if (!frm.is_new() && !frm.doc.onboarding_tracker && frm.doc.status === "Active") {
            frm.add_custom_button(__('Create Onboarding'), function () {
                create_onboarding_documents(frm);
            });
        }
    }
});

function create_onboarding_documents(frm) {
    frappe.model.with_doctype("Employee Onboarding Tracker", function() {
        let doc = frappe.model.get_new_doc("Employee Onboarding Tracker");

        doc.employee = frm.doc.name;
        doc.employee_name = frm.doc.employee_name;
        doc.date_of_joining = frm.doc.date_of_joining;
        doc.boarding_begins_on = frappe.datetime.get_today();

        // Route to the new document
        frappe.set_route("Form", "Employee Onboarding Tracker", doc.name);
    });
}