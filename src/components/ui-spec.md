### Project breadcrumbs

- Project breadcrumbes always behave like this:
- Projects > { Project name } > { Project document }
- The 'Project name' level will always be project details, where the root level README.md is displayed.
- When the user is at a document level, and clicks to another document, the breadcrumb never goes deeper from the documents level, it just replaces whichever document its looking at. Like:
  - Starting path: Projects > { Project name } > { Project document A }
  - Click new document link B which is embedded in project document A
  - Ending path: Projects > { Project name } > { Project document B }
