use super::wasm_smoke_add;

#[test]
fn smoke_adds_two_values() {
    assert_eq!(wasm_smoke_add(1.25, 2.75), 4.0);
}
