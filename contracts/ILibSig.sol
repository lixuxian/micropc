pragma solidity >=0.4.24 <0.7.0;

contract LibSig {
    function prefixed(bytes32 hash)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }

    function verify(address addr, bytes32 message, bytes memory signature)
        public
        pure
        returns(bool)
    {
        if (signature.length != 65)
            return (false);

        bytes32 r;
        bytes32 s;
        uint8 v;

        bytes memory sig = signature;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }

        if (v < 27)
            v += 27;

        if (v != 27 && v != 28)
            return (false);

        return ecrecover(message, v, r, s) == addr;
    }
}