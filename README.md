<!--
SPDX-FileCopyrightText: 2023 Kevin de Jong <monkaii@hotmail.com>
SPDX-License-Identifier: MIT
-->

# ReuseIt - Copyright and License Management Library

Creates an SPDX 2.3 Software Bill of Materials based on the provided files, per [ReUSE Software specification].

> ⚠️ **NOTE** ⚠️
> 
> ReuseIt (and its owner) are not part of a law firm and, as such, the owner nor the application provide legal advise.
> Using ReuseIt does not constitute legal advice or create an attorney-client relationship.
> 
> ReuseIt is created for the aggregation of Copyright and License information provided by the users in the files stored in their repositories.
> In the end, the users of ReuseIt are responsible for the correctness of the generated Software Bill of Materials, the associated licenses, and attributions.
> For that reason, ReuseIt is provided on an "as-is" basis and makes no warranties regarding any information or licenses provided on or through it, and disclaims liability for damages resulting from using the application.

## Features

* Easy to use
* Create SPDX 2.3 Software Bill of Materials
* Leverage the [Reuse Software specification]

<!-- Hee hee, hid a comment block in here -->

## Basic Usage

```typescript
import { SoftwareBillOfMaterials } from "@dev-build-deploy/reuse-it";

// Create an empty Software Bill of Materials
const sbom = new SoftwareBillOfMaterials("Example Project", "Example Tool v0");

// Add associated (related) files
await sbom.addFile("src/spdx/sbom.ts");

// Show the results
console.log(JSON.stringify(sbom, null, 2))
```

This will result in an SPDX 2.3 SBoM;

```JSON
{
  "SPDXID": "SPDXRef-DOCUMENT",
  "spdxVersion": "SPDX-2.3",
  "documentNamespace": "http://spdx.org/spdxdocs/spdx-v2.3-45eae250-b782-46dd-9723-62ec3bed2a7c",
  "dataLicense": "CC0-1.0",
  "relationships": [
    {
      "spdxElementId": "SPDXRef-DOCUMENT",
      "relationshipType": "DESCRIBES",
      "relatedSpdxElement": "SPDXRef-26277ea6651754576f3b48212813e2c9c26e7464"
    }
  ],
  "files": [
    {
      "checksum": [
        {
          "algorithm": "SHA1",
          "checksumValue": "32ac7ea6fbf35e1a03662715a1a345ccc569d05d"
        }
      ],
      "fileContributors": [],
      "fileTypes": [],
      "licenseConcluded": "NOASSERTION",
      "licenseInfoInFiles": [
        "MIT"
      ],
      "attributionTexts": [],
      "fileName": "./src/spdx/sbom.ts",
      "SPDXID": "SPDXRef-26277ea6651754576f3b48212813e2c9c26e7464",
      "copyrightText": "2023 Kevin de Jong <monkaii@hotmail.com>"
    }
  ],
  "name": "Example Project",
  "creationInfo": {
    "comment": "Generated by Example Tool v0",
    "created": "2023-01-01T00:00:00.000Z",
    "creators": [
      "Tool: Example Tool v0"
    ]
  }
}
```

## Basic guidelines

### Adding licensing and copyright information to your file
Per the [ReUSE Software specification], you can cover your files with the following approaches:

- Adding a [comment header](#https://reuse.software/spec/#comment-headers) in your files;
<!-- REUSE-IgnoreStart -->
```yaml
SPDX-FileCopyrightText: 2023 Kevin de Jong <monkaii@hotmail.com>
SPDX-License-Identifier: MIT
```
<!-- REUSE-IgnoreEnd -->

- Adding a `.license` file next to your (binary) files
- Using [DEP5](https://reuse.software/spec/#dep5) allows for specifying copyright and licensing in bulk

_Please refer to the [Reuse specification] for more details._

> **NOTE**: Support for `.license` and `DEP5` is still under construction

### Use SPDX File Tags to enrich your Software Bill of Materials
To enrichen your SPDX 2.3 SBOM, additional [File Tags](https://spdx.github.io/spdx-spec/v2.3/file-tags/) can be used to add additional information to each file. For example:

<!-- REUSE-IgnoreStart -->
```yaml
SPDX-FileCopyrightText: 2023 Kevin de Jong <monkaii@hotmail.com>
SPDX-FileType: DOCUMENTATION
SPDX-License-Identifier: MIT
SPDX-FileLicenseConcluded: MIT
SPDX-FileLicenseComments: This file is original work of the copyright holder, and therefor the license specified in the file is correct.
SPDX-FileComment: This file is part of the public documentation.
SPDX-FileContributor: Kevin de Jong
```
<!-- REUSE-IgnoreEnd -->

### Ignoring false positive matches

ReuseMe attempts to limit the number of false positive hits by;
- Only scanning the first 1024 characters of your files
- Ensure that `SPDX-` tags are the first words on a line

In case you do run into a false-positive match, you can use the `REUSE-IgnoreStart` and `REUSE-IgnoreEnd` tags to ignore snippets.

```typescript
function foo(bar: string) {
  // REUSE-IgnoreStart
  if (bar.includes(
    "SPDX-FileCopyrightText is important"
  )) {
    console.log("Ru-roh")
  }
  // REUSE-IgnoreEnd
}
```

## Contributing

If you have suggestions for how `reuse-it`` could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

- [MIT](./LICENSES/MIT.txt) © 2023 Kevin de Jong \<monkaii@hotmail.com\>

[ReUSE Software specification]: https://reuse.software/spec/
[Reuse specification]: https://reuse.software/spec/