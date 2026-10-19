The trash attributes deletions to the wrong person. There is no record of who
deleted a document, so the trash infers the deleting user from
`lastModifiedById`. That has two bad effects:

- When someone deletes a page that has nested pages, every nested page shows
  whoever last edited it, not the person who deleted the tree.
- Deleting a document rewrites the edit history: the deleter becomes the
  `lastModifiedById` of the document and all of its descendants.

Please record the deleting user properly, on the server side:

- Documents get a `deletedById` column (a nullable reference to a user).
- Soft-deleting a document records the acting user in `deletedById`. This
  includes nested documents deleted along with their parent. Restoring a
  document clears it.
- Deleting a document no longer changes `lastModifiedById` on its nested
  documents (deleting a document still records the deleter as the last
  modifier of that document itself, as it does today).
- Document API responses (for example `documents.info` and `documents.deleted`)
  include `deletedBy`, the presented user who deleted the document, for deleted
  documents. Documents that are not deleted have no `deletedBy`.
- The existing `deletedById` filter on `documents.deleted` keeps working.

The web client is out of scope.

Work within this local repository and the context you have been given. Do not
look up this project or its history online.
