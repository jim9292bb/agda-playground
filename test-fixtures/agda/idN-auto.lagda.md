# Identity on N

A small natural-number datatype and an `idN` goal to fill via Auto.

```agda
data N : Set where
  z : N
  s : N -> N

idN : N -> N
idN n = {! !}
```
