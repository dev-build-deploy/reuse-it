/*
SPDX-FileCopyrightText: 2023 Kevin de Jong <monkaii@hotmail.com>
SPDX-License-Identifier: MIT
*/


/**
 * SPDX Relationship
 * @interface IRelationship
 * @member spdxElementId The SPDX ID of the element
 * @member relationshipType The type of relationship
 * @member relatedSpdxElement The SPDX ID of the related element
 * @see https://spdx.github.io/spdx-spec/3-relationships-between-SPDX-elements/
 */
export interface IRelationship {
  /** The SPDX ID of the element */
  spdxElementId: string;
  /** The type of relationship */
  relationshipType: "DESCRIBES";
  /** The SPDX ID of the related element */
  relatedSpdxElement: string;
}