# Aragon Base template and shared template helpers

New templates can be easily created by building upon BaseTemplate and TokenCache. This package also provides a set of helpers for running tests on templates.

## BaseTemplate usage

The BaseTemplate contract should be extended by a new template. It provides a set of internal functions with actions common to all templates, such as installing apps, granting permissions, etc.

Make sure to consider the following rules when using BaseTemplate:
* `_transferRootPermissionsFromTemplateAndFinalizeDAO()` should be used only at the end of organization setup to transfer the "root" permissions to their final owners. This is usually the last action that the template will be able to take on the organization itself, as after calling this function, the template should not hold any permissions on the organization.
* You can optionally use `_registerId()` afterwards to register the org on ENS.

## TokenCache usage

Depending on the complexity of a template, you may need to initialize a template in more than one transaction. When doing so, the template needs to cache information about a partially built organization by a particular user. TokenCache's `_cacheToken()` and `_popTokenCache()` may be useful in cases where you only need to cache a single token.
