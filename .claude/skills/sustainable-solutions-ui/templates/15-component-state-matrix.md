# Template — Component inventory and interaction state matrix

Duplicate a row per component and variant. State and behavior must be documented, not just screenshot colors.

| Component | Default | Hover | Focus-visible | Pressed/selected | Disabled | Loading | Error | Empty | Mobile/keyboard | Test |
|---|---|---|---|---|---|---|---|---|---|---|
| Primary button | token | pointer/optional | 2px+ visible ring | active style | not clickable | status/progress, no double-submit | action failure | n/a | >=target size, Enter/Space | TODO |
| Text input | label+hint | border | focus ring | valid text | visually distinguished | optional async status | `aria-invalid` + linked error | clear prompt | native input | TODO |
| Select | label | pointer | focus ring | chosen value | readable | dependent options | validation | 'No options' | native keyboard | TODO |
| Chart | title+axes | tooltip optional | mark/table focus | selected datum | n/a | skeleton + announcement | descriptive fallback | no-data message | table is fully accessible | TODO |
| Map | visible legend | hover not sole mode | focusable controls | selected region+table | n/a | tiles/layers status | tile-free data alternative | no-data label | search/list/zoom; no drag-only | TODO |
| Media player | poster+description | controls | visible ring | playing state | inaccessible media alternative | buffered state | fallback/transcript | missing media disclosure | captions, pause, no autoplay | TODO |
| Citation link | descriptive title | underline | visible ring | visited if site supports | n/a | n/a | broken link fallback | no fabricated DOI | keyboard hyperlink | TODO |
| Download action | type/size scope | feedback | visible ring | pressed/complete | unavailable reason | progress | retry+error | empty-output explanation | accessible save | TODO |

### Template for one component

- **Name/owner:** [semantic name], [team].
- **Purpose:** [why users need it]; **do not use when:** [counterexample].
- **Anatomy:** [DOM elements, labels, help, status, attribution].
- **Tokens:** [actual resolved token names].
- **Keyboard:** [keys, focus entry/return, tab order].
- **State transitions:** [actions, loading, error/empty].
- **Screen reader:** [name, role, value, description, announcement].
- **Responsive:** [320px / 768px / desktop / 400% zoom].
- **Evidence:** [route/source path/screenshot].
- **Tests/results:** [exact commands; pass/fail/not run].
