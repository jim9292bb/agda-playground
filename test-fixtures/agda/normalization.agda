data N : Set where
  z : N
  s : N -> N

idN : N -> N
idN x = x

data T : N -> Set where
  t : T z

g : T (idN (idN z))
g = ?
