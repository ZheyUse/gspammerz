/**
 * SpammerZ Google Forms test generator.
 *
 * Paste this entire file into Google Apps Script, then run:
 *   createAllSpammerZTestForms()
 *
 * It creates multiple Google Forms that exercise smart detection for:
 * - Auto Name variants
 * - Auto Address variants, including PH and international wording
 * - Age, email, phone, birthdate
 * - Gender/sex, consent, household size
 * - School/course/year level, occupation, religion
 * - Option-based fields for Configure Weights (%)
 */

function createAllSpammerZTestForms() {
  const created = [
    createNameDetectionTestForm(),
    createAddressDetectionTestForm(),
    createDemographicSmartDetectionTestForm(),
    createOptionWeightsTestForm(),
    createResearchSurveyFullTestForm(),
  ];

  Logger.log('Created ' + created.length + ' SpammerZ test forms:');
  created.forEach(function(form) {
    Logger.log(form.getTitle());
    Logger.log('Edit: ' + form.getEditUrl());
    Logger.log('Live: ' + form.getPublishedUrl());
  });
}

function createNameDetectionTestForm() {
  const form = createBaseForm('SpammerZ Test - Auto Name Detection');

  addShortText(form, 'Full Name', true);
  addShortText(form, 'Name', true);
  addShortText(form, 'FIRST NAME', true);
  addShortText(form, 'First Name', true);
  addShortText(form, 'Given Name', true);
  addShortText(form, 'Middle Name', false);
  addShortText(form, 'M.I.', false);
  addShortText(form, 'Middle Initial', false);
  addShortText(form, 'Last Name', true);
  addShortText(form, 'Surname', true);
  addShortText(form, 'Family Name', true);
  addShortText(form, 'Extension / Suffix', false);
  addShortText(form, 'Last Name, First Name', true);
  addShortText(form, 'First Name, Middle Name, Last Name', true);
  addShortText(form, 'Guardian Name', false);
  addShortText(form, 'Mother Name', false);
  addShortText(form, 'Father Name', false);

  addParagraph(form, 'Describe yourself briefly', false);
  return form;
}

function createAddressDetectionTestForm() {
  const form = createBaseForm('SpammerZ Test - Auto Address Detection');

  addShortText(form, 'Permanent Address', true);
  addShortText(form, 'Permanent Adress', true);
  addShortText(form, 'Present Address', true);
  addShortText(form, 'Current Address', true);
  addShortText(form, 'Location', true);
  addShortText(form, 'Home Location', true);
  addShortText(form, 'Place of Residence', true);
  addShortText(form, 'Where do you live?', true);
  addShortText(form, 'Where are you located?', true);

  addShortText(form, 'Address Line 1', true);
  addShortText(form, 'Address Line 2', false);
  addShortText(form, 'Street Number and Street Name', true);
  addShortText(form, 'Unit / Floor / Building / Subdivision', false);
  addShortText(form, 'City / Municipality', true);
  addShortText(form, 'Town', true);
  addShortText(form, 'Province / State / Region', true);
  addShortText(form, 'Province', true);
  addShortText(form, 'Region', false);
  addShortText(form, 'Postal / Zip Code', true);
  addShortText(form, 'Country', true);

  addShortText(form, 'Barangay', true);
  addShortText(form, 'Brgy', true);
  addShortText(form, 'Prefecture', false);
  addShortText(form, 'Ward / District', false);

  addList(form, 'Country Dropdown', ['Philippines', 'United States', 'Japan', 'Canada', 'Australia'], true);
  addList(form, 'Province Dropdown', ['Cebu', 'Davao', 'Bohol', 'Metro Manila', 'Cavite'], true);
  addList(form, 'City Dropdown', ['Cebu City', 'Balamban', 'Manila', 'Quezon City', 'Davao City'], true);
  addList(form, 'Barangay Dropdown', ['Biasong', 'Aliwanay', 'Buanoy', 'Arpili', 'Poblacion'], false);

  return form;
}

function createDemographicSmartDetectionTestForm() {
  const form = createBaseForm('SpammerZ Test - Smart Demographics');

  addShortText(form, 'Age', true);
  addShortText(form, 'Your Age', true);
  addShortText(form, 'How old are you?', true);
  addShortText(form, 'Years old', false);
  addShortText(form, 'Edad', false);

  addShortText(form, 'Email Address', true);
  addShortText(form, 'Gmail', false);
  addShortText(form, 'Contact Number', true);
  addShortText(form, 'Mobile Number', true);
  addShortText(form, 'Phone', false);
  addShortText(form, 'Cellphone Number', false);

  addDate(form, 'Date of Birth', true);
  addDate(form, 'Birthdate', false);
  addShortText(form, 'DOB', false);

  addShortText(form, 'Gender', false);
  addShortText(form, 'Sex', false);
  addMultipleChoice(form, 'Sex - Radio', ['Male', 'Female'], true);
  addList(form, 'Gender - Dropdown', ['Male', 'Female', 'Non-binary', 'Prefer not to say'], true);

  addShortText(form, 'School', true);
  addShortText(form, 'University', false);
  addShortText(form, 'College', false);
  addShortText(form, 'Campus', false);
  addShortText(form, 'Course / Program', true);
  addShortText(form, 'Degree', false);
  addShortText(form, 'Strand / Track', false);
  addShortText(form, 'Year Level', true);
  addShortText(form, 'Grade Level', false);
  addShortText(form, 'Academic Year', false);
  addShortText(form, 'Section', false);

  addShortText(form, 'Occupation', false);
  addShortText(form, 'Employment Status', false);
  addShortText(form, 'Work Status', false);
  addShortText(form, 'Religion', false);
  addShortText(form, 'Household Size', false);
  addShortText(form, 'Number of Family Members', false);

  addCheckbox(form, 'Consent and Data Privacy', ['I agree', 'I do not agree'], true);
  addCheckbox(form, 'Terms and Conditions', ['I accept the terms', 'I decline'], true);
  addMultipleChoice(form, 'Are you 18 years old and above?', ['Yes', 'No'], true);

  return form;
}

function createOptionWeightsTestForm() {
  const form = createBaseForm('SpammerZ Test - Configure Weights Controls');

  addMultipleChoice(form, 'Research respondent type', ['Student', 'Teacher', 'Parent', 'Employee'], true);
  addList(form, 'Preferred learning modality', ['Online', 'Modular', 'Face-to-face', 'Hybrid'], true);
  addCheckbox(form, 'Social media platforms used', ['Facebook', 'TikTok', 'Instagram', 'YouTube', 'X / Twitter'], true);
  addScale(form, 'Satisfaction Level', 1, 5, true);
  addScale(form, 'Agreement Level', 1, 10, true);
  addMultipleChoice(form, 'Civil Status', ['Single', 'Married', 'Widowed', 'Separated'], false);
  addList(form, 'Monthly Allowance Range', ['Below 1000', '1000-3000', '3001-5000', 'Above 5000'], false);
  addMultipleChoice(form, 'Employment Status', ['Student', 'Employed', 'Self-employed', 'Unemployed'], false);
  addList(form, 'Religion Dropdown', ['Roman Catholic', 'Christian', 'Islam', 'Iglesia ni Cristo', 'Prefer not to say'], false);

  addGrid(
    form,
    'Rate the following services',
    ['Enrollment', 'Library', 'Internet', 'Canteen'],
    ['Poor', 'Fair', 'Good', 'Excellent'],
    true
  );

  addCheckboxGrid(
    form,
    'Which tools do you use for each activity?',
    ['Research', 'Communication', 'Design'],
    ['Google', 'YouTube', 'Canva', 'ChatGPT'],
    false
  );

  return form;
}

function createResearchSurveyFullTestForm() {
  const form = createBaseForm('SpammerZ Test - Full Research Survey');

  addShortText(form, 'Full Name', true);
  addShortText(form, 'Age', true);
  addDate(form, 'Birthdate', true);
  addMultipleChoice(form, 'Sex', ['Male', 'Female'], true);
  addList(form, 'Gender', ['Male', 'Female', 'Prefer not to say'], false);
  addShortText(form, 'Email Address', true);
  addShortText(form, 'Contact Number', true);

  addShortText(form, 'Permanent Address', true);
  addShortText(form, 'Province', true);
  addShortText(form, 'City / Municipality', true);
  addShortText(form, 'Barangay', true);
  addShortText(form, 'Postal / Zip Code', true);

  addShortText(form, 'School / University', true);
  addShortText(form, 'Course / Program / Strand', true);
  addShortText(form, 'Year Level / Grade Level', true);
  addShortText(form, 'Section', false);
  addMultipleChoice(form, 'Occupation / Employment Status', ['Student', 'Employed', 'Self-employed', 'Unemployed'], true);
  addList(form, 'Religion', ['Roman Catholic', 'Christian', 'Islam', 'Iglesia ni Cristo', 'Prefer not to say'], false);
  addShortText(form, 'Household Size', false);

  addScale(form, 'How satisfied are you with your current learning environment?', 1, 5, true);
  addMultipleChoice(form, 'Do you use online resources for studying?', ['Yes', 'No', 'Sometimes'], true);
  addCheckbox(form, 'Which online platforms do you use?', ['Google Classroom', 'Facebook', 'YouTube', 'TikTok', 'ChatGPT'], false);
  addParagraph(form, 'What challenges do you experience in your studies?', false);

  addCheckbox(form, 'Data Privacy Consent', ['I agree to participate in this research study'], true);

  return form;
}

function createBaseForm(title) {
  return FormApp.create(title)
    .setDescription('Generated by SpammerZ_TestForms.gs for detection and Configure Weights testing.')
    .setCollectEmail(false)
    .setAllowResponseEdits(false)
    .setLimitOneResponsePerUser(false);
}

function addShortText(form, title, required) {
  return form.addTextItem()
    .setTitle(title)
    .setRequired(Boolean(required));
}

function addParagraph(form, title, required) {
  return form.addParagraphTextItem()
    .setTitle(title)
    .setRequired(Boolean(required));
}

function addDate(form, title, required) {
  return form.addDateItem()
    .setTitle(title)
    .setRequired(Boolean(required));
}

function addMultipleChoice(form, title, options, required) {
  return form.addMultipleChoiceItem()
    .setTitle(title)
    .setChoiceValues(options)
    .setRequired(Boolean(required));
}

function addCheckbox(form, title, options, required) {
  return form.addCheckboxItem()
    .setTitle(title)
    .setChoiceValues(options)
    .setRequired(Boolean(required));
}

function addList(form, title, options, required) {
  return form.addListItem()
    .setTitle(title)
    .setChoiceValues(options)
    .setRequired(Boolean(required));
}

function addScale(form, title, lower, upper, required) {
  return form.addScaleItem()
    .setTitle(title)
    .setBounds(lower, upper)
    .setLabels('Low', 'High')
    .setRequired(Boolean(required));
}

function addGrid(form, title, rows, columns, required) {
  return form.addGridItem()
    .setTitle(title)
    .setRows(rows)
    .setColumns(columns)
    .setRequired(Boolean(required));
}

function addCheckboxGrid(form, title, rows, columns, required) {
  return form.addCheckboxGridItem()
    .setTitle(title)
    .setRows(rows)
    .setColumns(columns)
    .setRequired(Boolean(required));
}
