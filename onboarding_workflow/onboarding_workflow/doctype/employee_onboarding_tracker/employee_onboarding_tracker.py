# Copyright (c) 2025, Akram Mutaher and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.mapper import get_mapped_doc
import json

from hrms.controllers.employee_boarding_controller import EmployeeBoardingController


class IncompleteTaskError(frappe.ValidationError):
	pass


class EmployeeOnboardingTracker(EmployeeBoardingController):
	def validate(self):
		super().validate()
		self.validate_duplicate_employee_onboarding()

	def after_insert(self):
		if self.employee:
			employee_doc = frappe.get_doc("Employee", self.employee)
			employee_doc.onboarding_tracker = self.name
			employee_doc.save(ignore_permissions=True)
			#frappe.db.set_value("Employee", self.employee, "onboarding_tracker", self.name)

	def validate_duplicate_employee_onboarding(self):
		emp_onboarding = frappe.db.exists(
			"Employee Onboarding Tracker", {"employee": self.employee, "docstatus": ("!=", 2)}
		)
		if emp_onboarding and emp_onboarding != self.name:
			frappe.throw(
				_("Employee Onboarding Tracker: {0} already exists for Job Employee: {1}").format(
					frappe.bold(emp_onboarding), frappe.bold(self.employee)
				)
			)

	def on_submit(self):
		# create the project for the given employee onboarding
		project_name = _(self.doctype) + " : "
		project_name += self.employee

		project = frappe.get_doc(
			{
				"doctype": "Project",
				"project_name": project_name,
				"expected_start_date": self.date_of_joining,
				"department": self.department,
				"company": self.company,
			}
		).insert(ignore_permissions=True, ignore_mandatory=True)

		self.db_set("project", project.name)
		self.db_set("boarding_status", "Pending")
		self.reload()
		self.create_task_and_notify_user()

	def on_update_after_submit(self):
		self.create_task_and_notify_user()

	def on_cancel(self):
		#super().on_cancel()
		# delete task project
		project = self.project
		for task in frappe.get_all("Task", filters={"project": project}):
			frappe.delete_doc("Task", task.name, force=1)
		frappe.delete_doc("Project", project, force=1)
		self.db_set("project", "")
		for activity in self.activities:
			activity.db_set("task", "")
			activity.db_set("activity_status", "Open")

		frappe.msgprint(
			_("Linked Project {} and Tasks deleted.").format(project), alert=True, indicator="blue"
		)
		self.clear_onboarding_tracker_link()

	def on_trash(self):
		self.clear_onboarding_tracker_link()

	def clear_onboarding_tracker_link(self):
		if self.employee:
			frappe.db.set_value("Employee", self.employee, "onboarding_tracker", None)

	@frappe.whitelist()
	def mark_onboarding_as_completed(self):
		for activity in self.activities:
			frappe.db.set_value("Task", activity.task, "status", "Completed")
		frappe.db.set_value("Project", self.project, "status", "Completed")
		self.boarding_status = "Completed"
		self.save()

@frappe.whitelist()
def get_onboarding_summary(onboarding_name: str) -> dict:
	summary = frappe._dict()

	summary["open"] = frappe.db.count(
		"Employee Boarding Activity", {"parent": onboarding_name, "activity_status": "Open"}
	)
	summary["working"] = frappe.db.count(
		"Employee Boarding Activity", {"parent": onboarding_name, "activity_status": "Working"}
	)
	summary["completed"] = frappe.db.count(
		"Employee Boarding Activity", {"parent": onboarding_name, "activity_status": "Completed"}
	)

	return summary

@frappe.whitelist()
def update_onboarding_child_links(child_doctype, updates):
    if isinstance(updates, str):
        updates = json.loads(updates)

    for row in updates:
        frappe.db.set_value(child_doctype, row["name"], row["field"], row["value"])

    frappe.db.commit()
    return "success"
