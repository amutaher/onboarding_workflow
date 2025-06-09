import frappe
from frappe import _
from frappe.utils import flt

def custom_update_employee_boarding_status(self, method=None):
	onboarding_tracker = frappe.db.exists("Employee Onboarding Tracker", {"project": self.name})

	if not (onboarding_tracker):
		return

	status = "Pending"
	if flt(self.percent_complete) > 0.0 and flt(self.percent_complete) < 100.0:
		status = "In Process"
	elif flt(self.percent_complete) == 100.0:
		status = "Completed"

	if onboarding_tracker:
		frappe.db.set_value("Employee Onboarding Tracker", onboarding_tracker, "boarding_status", status)


def custom_update_task(self, method=None):
	activity = frappe.db.exists("Employee Boarding Activity", {"task": self.name})
	if activity:
		frappe.db.set_value("Employee Boarding Activity", activity, "activity_status", self.status)
	if self.project and not self.flags.from_project:
		custom_update_employee_boarding_status(frappe.get_cached_doc("Project", self.project))


def clear_asset_movement_reference(doc, method):
    clear_onboarding_references("asset_movement", doc.name)

def clear_material_request_reference(doc, method):
    clear_onboarding_references("material_request", doc.name)


def clear_onboarding_references(fieldname, docname):
    frappe.db.sql(f"""
        UPDATE `tabRequired Assets`
        SET `{fieldname}` = NULL
        WHERE `{fieldname}` = %s
    """, (docname,))
    frappe.db.commit()